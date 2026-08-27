// This document intentionally has no network dependency. epub.js is embedded
// inline (passed in as `epubRuntime`) so it is guaranteed to execute before
// the boot script below runs — relying on injectedJavaScriptBeforeContentLoaded
// is unreliable on Android WebView (it can fire after the page's own inline
// scripts, or not at all), which caused "epub.js was not injected" errors.
export const buildReaderHtml = (epubRuntime: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fff;
      touch-action: pan-y;
      -webkit-tap-highlight-color: transparent;
    }
    #viewer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }
  </style>
</head>
<body>
  <div id="viewer"></div>
  <script>${epubRuntime}</script>
  <script>
  (function () {
    var book, rendition;
    var currentFlow = 'paginated';
    var send = function (type, payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      }
    };

    // Forward console logs to React Native console
    var origLog = console.log;
    var origErr = console.error;
    var origWarn = console.warn;
    console.log = function () {
      var args = Array.prototype.slice.call(arguments);
      send('log', { level: 'log', message: args.map(String).join(' ') });
      origLog.apply(console, arguments);
    };
    console.error = function () {
      var args = Array.prototype.slice.call(arguments);
      send('log', { level: 'error', message: args.map(String).join(' ') });
      origErr.apply(console, arguments);
    };
    console.warn = function () {
      var args = Array.prototype.slice.call(arguments);
      send('log', { level: 'warn', message: args.map(String).join(' ') });
      origWarn.apply(console, arguments);
    };

    var applyTheme = function (theme) {
      if (!rendition) return;
      theme = theme || {};
      var bg = theme.background || '#fff';
      document.body.style.background = bg;
      var viewerEl = document.getElementById('viewer');
      if (viewerEl) viewerEl.style.background = bg;

      rendition.themes.default({
        body: {
          background: bg,
          color: theme.color || '#111',
          'font-family': theme.fontFamily || 'system-ui',
          'font-size': (theme.fontSize || 18) + 'px',
          'line-height': theme.lineHeight || 1.6
        },
        'p, div, span, h1, h2, h3, h4, h5, h6, li': {
          color: (theme.color || '#111') + ' !important'
        }
      });
    };

    var base64ToArrayBuffer = function (base64) {
      var binaryString = window.atob(base64);
      var len = binaryString.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    };

    var open = function (config) {
      try {
        console.log('[Reader] open() called, viewer rect:', JSON.stringify(document.getElementById('viewer').getBoundingClientRect()));
        if (!window.ePub) throw new Error('epub.js was not injected into the reader');
        if (rendition) {
          try { rendition.destroy(); } catch (e) {}
          rendition = null;
        }
        if (book) {
          try { book.destroy(); } catch (e) {}
          book = null;
        }
        var viewerEl = document.getElementById('viewer');
        if (viewerEl) viewerEl.innerHTML = '';

        var inputData = config.openAs === 'base64'
          ? base64ToArrayBuffer(config.source)
          : config.source;

        currentFlow = config.flow || 'paginated';
        console.log('[Reader] Initializing ePub book with flow:', currentFlow);
        book = window.ePub(inputData);

        var isScrolled = currentFlow === 'scrolled';
        rendition = book.renderTo('viewer', {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: isScrolled ? 'scrolled-doc' : 'paginated'
        });

        applyTheme(config.theme);

        window.addEventListener('resize', function () {
          if (rendition) {
            console.log('[Reader] window resize -> rendition.resize');
            rendition.resize('100%', '100%');
          }
        });

        var isTransitioning = false;

        // Register content hook to handle swipe gestures (paginated) & pull-to-transition (scrolled)
        rendition.hooks.content.register(function (contents) {
          if (!contents || !contents.document) return;

          var touchStartX = 0;
          var touchStartY = 0;
          var touchStartTime = 0;
          var touchStartScrollTop = 0;

          contents.document.addEventListener('touchstart', function (e) {
            if (e.touches && e.touches.length === 1) {
              touchStartX = e.touches[0].clientX;
              touchStartY = e.touches[0].clientY;
              touchStartTime = Date.now();
              var v = document.getElementById('viewer');
              touchStartScrollTop = v ? v.scrollTop : 0;
            }
          }, { passive: true });

          contents.document.addEventListener('touchend', function (e) {
            if (e.changedTouches && e.changedTouches.length === 1) {
              var deltaX = e.changedTouches[0].clientX - touchStartX;
              var deltaY = e.changedTouches[0].clientY - touchStartY;
              var deltaTime = Date.now() - touchStartTime;

              if (currentFlow === 'paginated') {
                // Horizontal swipe in paginated mode (threshold: 50px, predominantly horizontal)
                if (Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && deltaTime < 600) {
                  if (deltaX < 0) {
                    console.log('[Reader] Swipe Left -> next page/chapter');
                    rendition.next();
                  } else {
                    console.log('[Reader] Swipe Right -> prev page/chapter');
                    rendition.prev();
                  }
                }
              } else if (currentFlow === 'scrolled' && !isTransitioning) {
                // In scrolled mode, only transition if the user was ALREADY at the boundary
                // when touch started and performed an intentional pull gesture (>= 65px).
                var v = document.getElementById('viewer');
                if (!v) return;
                var clientHeight = v.clientHeight;
                var scrollHeight = v.scrollHeight;

                var wasAtBottom = (touchStartScrollTop + clientHeight >= scrollHeight - 30) || (scrollHeight <= clientHeight + 15);
                var wasAtTop = touchStartScrollTop <= 25;
                var isIntentionalVerticalPull = Math.abs(deltaY) >= 65 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5;

                // Pull UP at bottom -> Next Chapter
                if (deltaY < 0 && isIntentionalVerticalPull && wasAtBottom) {
                  isTransitioning = true;
                  console.log('[Reader] Intentional pull up at bottom -> next chapter');
                  rendition.next().then(function () {
                    v.scrollTop = 0;
                    setTimeout(function () { isTransitioning = false; }, 500);
                  }).catch(function () { isTransitioning = false; });
                }
                // Pull DOWN at top -> Prev Chapter
                else if (deltaY > 0 && isIntentionalVerticalPull && wasAtTop) {
                  isTransitioning = true;
                  console.log('[Reader] Intentional pull down at top -> prev chapter');
                  rendition.prev().then(function () {
                    v.scrollTop = v.scrollHeight;
                    setTimeout(function () { isTransitioning = false; }, 500);
                  }).catch(function () { isTransitioning = false; });
                }
              }
            }
          }, { passive: true });

          // Intercept links inside book content
          contents.document.addEventListener('click', function (event) {
            var anchor = event.target.closest && event.target.closest('a');
            if (anchor) {
              var href = anchor.getAttribute('href');
              if (href) {
                event.preventDefault();
                event.stopPropagation();
                if (href.indexOf('://') > -1 || href.indexOf('mailto:') === 0) {
                  send('link', href);
                } else {
                  console.log('[Reader] Internal link clicked in content:', href);
                  send('link', href);
                  rendition.display(href).catch(function (err) {
                    console.error('[Reader] display link failed:', href, err);
                  });
                }
              }
            }
          }, true);
        });

        rendition.display(config.initialLocation || undefined).then(function (section) {
          console.log('[Reader] rendition.display resolved successfully:', section ? section.href : 'ok');
          var viewerEl = document.getElementById('viewer');
          console.log('[Reader] Viewer DOM children count:', viewerEl ? viewerEl.children.length : 0);
          send('displayed', { href: section ? section.href : '' });
        }).catch(function (err) {
          console.error('[Reader] display failed:', err);
          send('error', 'display failed: ' + String(err && err.message || err));
        });

        rendition.on('rendered', function (section, view) {
          console.log('[Reader] rendition rendered event for section:', section ? section.href : 'unknown');
        });

        book.ready.then(function () {
          console.log('[Reader] book.ready resolved, title:', book.package.metadata.title);
          send('ready', { title: book.package.metadata.title, creator: book.package.metadata.creator });
        }).catch(function (err) {
          console.error('[Reader] book.ready failed:', err);
          send('error', 'book.ready failed: ' + String(err && err.message || err));
        });

        // Send Table of Contents (TOC) to React Native
        book.loaded.navigation.then(function (nav) {
          console.log('[Reader] navigation loaded, toc count:', nav.toc ? nav.toc.length : 0);
          send('toc', nav.toc || []);
        }).catch(function (err) {
          console.warn('[Reader] book.loaded.navigation failed:', err);
        });

        rendition.on('relocated', function (location) {
          console.log('[Reader] relocated:', JSON.stringify(location.start));
          send('location', { cfi: location.start.cfi, progression: location.start.percentage, displayed: location.start.displayed });
        });

        rendition.on('click', function (event) {
          var anchor = event.target.closest && event.target.closest('a');
          if (anchor && anchor.href) {
            var href = anchor.getAttribute('href');
            if (href && href.indexOf('://') === -1 && href.indexOf('mailto:') !== 0) {
              rendition.display(href);
            }
            send('link', href || anchor.href);
          }
        });
      } catch (error) {
        console.error('[Reader] open error:', error);
        send('error', String(error && error.message || error));
      }
    };

    window.addEventListener('message', function (event) {
      if (!event.data || typeof event.data !== 'string' || event.data.charAt(0) !== '{') return;
      try {
        var msg = JSON.parse(event.data);
        if (!msg || typeof msg !== 'object' || !msg.type) return;
        console.log('[Reader] received message:', msg.type);
        if (msg.type === 'open') open(msg.payload);
        if (msg.type === 'goTo' && rendition) rendition.display(msg.payload);
        if (msg.type === 'next' && rendition) rendition.next();
        if (msg.type === 'prev' && rendition) rendition.prev();
        if (msg.type === 'theme') applyTheme(msg.payload);
        if (msg.type === 'flow' && rendition) {
          var flowMode = msg.payload === 'scrolled' ? 'scrolled-doc' : 'paginated';
          rendition.flow(flowMode);
        }
      } catch (e) {
        // Ignore non-JSON or unrelated messages
      }
    });

    document.addEventListener('message', function (event) {
      if (!event.data || typeof event.data !== 'string' || event.data.charAt(0) !== '{') return;
      window.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });

    console.log('[Reader] booted, notifying RN');
    send('booted');
  }());
  </script>
</body>
</html>`;
