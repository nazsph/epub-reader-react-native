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
      -webkit-tap-highlight-color: transparent;
    }
    #viewer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
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

    var updateViewerFlowStyles = function (flow) {
      currentFlow = flow || 'paginated';
      var v = document.getElementById('viewer');
      if (!v) return;
      if (currentFlow === 'scrolled') {
        v.style.overflowY = 'auto';
        v.style.overflowX = 'hidden';
        v.style.webkitOverflowScrolling = 'touch';
        v.style.touchAction = 'pan-y';
      } else {
        v.style.overflow = 'hidden';
        v.style.overflowX = 'hidden';
        v.style.overflowY = 'hidden';
        v.style.webkitOverflowScrolling = 'auto';
        v.style.touchAction = 'none';
      }
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
        book = window.ePub(inputData);

        var isScrolled = currentFlow === 'scrolled';
        rendition = book.renderTo('viewer', {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: isScrolled ? 'scrolled-doc' : 'paginated'
        });

        updateViewerFlowStyles(currentFlow);
        applyTheme(config.theme);

        window.addEventListener('resize', function () {
          if (rendition) {
            rendition.resize('100%', '100%');
          }
        });

        var isTransitioning = false;
        var touchStartX = 0;
        var touchStartY = 0;
        var touchStartTime = 0;
        var touchStartScrollTop = 0;

        var onTouchStart = function (e) {
          if (e.touches && e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            var v = document.getElementById('viewer');
            touchStartScrollTop = v ? v.scrollTop : 0;
          }
        };

        var onTouchEnd = function (e) {
          if (isTransitioning) return;
          if (e.changedTouches && e.changedTouches.length === 1) {
            var deltaX = e.changedTouches[0].clientX - touchStartX;
            var deltaY = e.changedTouches[0].clientY - touchStartY;
            var deltaTime = Date.now() - touchStartTime;

            // Single tap detection (distance < 15px and duration < 350ms)
            if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && deltaTime < 350) {
              send('tap', { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });
              return;
            }

            if (currentFlow === 'paginated') {
              // Stable horizontal swipe: exactly 1 page per swipe
              if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && deltaTime < 750) {
                isTransitioning = true;
                var p = deltaX < 0 ? rendition.next() : rendition.prev();
                if (p && p.then) {
                  p.then(function () {
                    setTimeout(function () { isTransitioning = false; }, 350);
                  }).catch(function () {
                    isTransitioning = false;
                  });
                } else {
                  setTimeout(function () { isTransitioning = false; }, 350);
                }
              }
            } else if (currentFlow === 'scrolled') {
              var v = document.getElementById('viewer');
              if (!v) return;
              var clientHeight = v.clientHeight;
              var scrollHeight = v.scrollHeight;

              var wasAtBottom = (touchStartScrollTop + clientHeight >= scrollHeight - 30) || (scrollHeight <= clientHeight + 15);
              var wasAtTop = touchStartScrollTop <= 25;
              var isIntentionalVerticalPull = Math.abs(deltaY) >= 60 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3;

              // Pull UP at bottom -> Next Chapter
              if (deltaY < 0 && isIntentionalVerticalPull && wasAtBottom) {
                isTransitioning = true;
                rendition.next().then(function () {
                  v.scrollTop = 0;
                  setTimeout(function () { isTransitioning = false; }, 400);
                }).catch(function () { isTransitioning = false; });
              }
              // Pull DOWN at top -> Prev Chapter
              else if (deltaY > 0 && isIntentionalVerticalPull && wasAtTop) {
                isTransitioning = true;
                rendition.prev().then(function () {
                  v.scrollTop = v.scrollHeight;
                  setTimeout(function () { isTransitioning = false; }, 400);
                }).catch(function () { isTransitioning = false; });
              }
            }
          }
        };

        // Attach touch listeners to outer viewer
        var viewerContainer = document.getElementById('viewer');
        if (viewerContainer) {
          viewerContainer.addEventListener('touchstart', onTouchStart, { passive: true });
          viewerContainer.addEventListener('touchend', onTouchEnd, { passive: true });
        }

        // Register content hook for iframe touches & link handling
        rendition.hooks.content.register(function (contents) {
          if (!contents || !contents.document) return;

          contents.document.addEventListener('touchstart', onTouchStart, { passive: true });
          contents.document.addEventListener('touchend', onTouchEnd, { passive: true });

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
                  send('link', href);
                  rendition.display(href).catch(function (err) {
                    console.error('[Reader] display link failed:', href, err);
                  });
                }
              }
            }
          }, true);
        });

        var sendCurrentLocation = function (explicitLoc) {
          var loc = explicitLoc || (rendition && rendition.location && rendition.location.start);
          if (!loc) return;
          var pct = typeof loc.percentage === 'number' && !isNaN(loc.percentage) ? loc.percentage : 0;
          if (book && book.locations && typeof book.locations.percentageFromCfi === 'function' && loc.cfi) {
            try {
              var calculatedPct = book.locations.percentageFromCfi(loc.cfi);
              if (typeof calculatedPct === 'number' && !isNaN(calculatedPct)) {
                pct = calculatedPct;
              }
            } catch (e) {}
          }
          send('location', {
            cfi: loc.cfi,
            progression: pct,
            displayed: loc.displayed,
            href: loc.href,
            index: loc.index
          });
        };

        rendition.display(config.initialLocation || undefined).then(function (section) {
          var viewerEl = document.getElementById('viewer');
          send('displayed', { href: section ? section.href : '' });
          sendCurrentLocation();
        }).catch(function (err) {
          console.error('[Reader] display failed:', err);
          send('error', 'display failed: ' + String(err && err.message || err));
        });

        rendition.on('rendered', function (section, view) {
        });

        book.ready.then(function () {
          send('ready', { title: book.package.metadata.title, creator: book.package.metadata.creator });

          // Generate locations for accurate percentages across all chapters
          return book.locations.generate(1024);
        }).then(function (locations) {
          send('locationsReady', locations ? locations.length : 0);
          sendCurrentLocation();
        }).catch(function (err) {
          console.warn('[Reader] locations generation note:', err);
        });

        // Send Table of Contents (TOC) to React Native
        book.loaded.navigation.then(function (nav) {
          send('toc', nav.toc || []);
        }).catch(function (err) {
          console.warn('[Reader] book.loaded.navigation failed:', err);
        });

        rendition.on('relocated', function (location) {
          sendCurrentLocation(location.start);
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
        if (msg.type === 'open') open(msg.payload);
        if (msg.type === 'goTo' && rendition) {
          if (typeof msg.payload === 'number' && book && book.locations) {
            var cfi = book.locations.cfiFromPercentage(msg.payload);
            if (cfi) rendition.display(cfi);
            else rendition.display(msg.payload);
          } else {
            rendition.display(msg.payload);
          }
        }
        if (msg.type === 'goToPercentage' && rendition && book && book.locations) {
          var targetCfi = book.locations.cfiFromPercentage(msg.payload);
          if (targetCfi) rendition.display(targetCfi);
        }
        if (msg.type === 'next' && rendition) rendition.next();
        if (msg.type === 'prev' && rendition) rendition.prev();
        if (msg.type === 'theme') applyTheme(msg.payload);
        if (msg.type === 'flow' && rendition) {
          currentFlow = msg.payload === 'scrolled' ? 'scrolled' : 'paginated';
          var flowMode = currentFlow === 'scrolled' ? 'scrolled-doc' : 'paginated';
          updateViewerFlowStyles(currentFlow);
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

    send('booted');
  }());
  </script>
</body>
</html>`;
