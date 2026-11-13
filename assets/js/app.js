/**
 * PDF-Werkstatt Pro v1.0 — Desktop Web Suite Application Engine
 * Works with PHP 5.4+ Backend & Client-Side PDF-Lib / PDF.js / Tesseract / JSZip
 */
(function () {
    'use strict';

    // Configure PDF.js worker (100% local offline path)
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'assets/vendor/pdf.worker.min.js';
    }

    // =========================================================================
    // Application State
    // =========================================================================
    var state = {
        tabs: [],              // Array of open document objects: { id, name, bytes (Uint8Array), pageCount, currentPage, annotations: { [pageIndex]: [] }, modified }
        activeTabId: null,
        viewMode: 'launcher',  // 'launcher' | 'organizer' | 'editor'
        activeTool: 'select',  // 'select' | 'edit-text' | 'text' | 'pen' | 'highlight' | 'redact' | 'rect' | 'stamp'
        zoom: 1.1,
        selectedAnnotationIndex: -1,
        currentPageTextBlocks: [], // Extracted PDF.js text lines on current page for inline editing
        pdfSearchQuery: '',
        pdfSearchMatches: [],      // Array of { pageIndex, x, y, w, h, text }
        pdfSearchActiveIdx: -1,
        ttsSpeaking: false,        // Text-to-Speech active flag
        ttsPaused: false,          // Text-to-Speech paused flag
        ttsActiveBlockIndex: -1,   // Index in currentPageTextBlocks currently being spoken
        ttsSessionId: 0,           // Monotonic counter to cancel stale TTS callbacks
        isDrawing: false,
        dragMode: null,        // 'draw' | 'move-ann'
        dragStart: { x: 0, y: 0 },
        dragOffset: { x: 0, y: 0 },
        currentDraftAnnotation: null,
        tray: [],              // Sammelmappe items: { id, sourceName, pageIndex, pdfBytes, thumbDataUrl }
        contextPageIndex: null,// 0-based page index for right-click context menu
        user: null,            // Logged-in account object or null (Guest)
        quota: null,           // Workspace storage quota info from config.php
        csrfToken: window.PDFSTUDIO_CSRF_TOKEN || '',
        workspaceFiles: [],    // Cached list of files in current workspace/vault
        autoSaveEnabled: true, // Automatic 5-minute document backup
        autoSaveIntervalMs: 300000, // 5 minutes (300,000 ms)
        autoSaveTimer: null,
        isAutoSaving: false
    };

    // DOM Elements cache
    var el = {
        pdfCanvas: document.getElementById('pdfRenderCanvas'),
        annCanvas: document.getElementById('annotationCanvas'),
        stageWrapper: document.getElementById('pageStageWrapper'),
        tabsList: document.getElementById('docTabsList'),
        thumbList: document.getElementById('thumbnailList'),
        trayList: document.getElementById('trayList'),
        trayBadge: document.getElementById('trayCountBadge'),
        serverFilesList: document.getElementById('serverFilesList'),
        organizerGrid: document.getElementById('organizerGrid'),
        leftPageSummary: document.getElementById('leftPageSummary'),
        statusText: document.getElementById('statusText'),
        statusDocSize: document.getElementById('statusDocSize'),
        statusPageDim: document.getElementById('statusPageDim'),
        statusProgressWrap: document.getElementById('statusProgressWrap'),
        statusProgressFill: document.getElementById('statusProgressFill'),
        statusProgressLabel: document.getElementById('statusProgressLabel'),
        floatingPageIndicator: document.getElementById('floatingPageIndicator'),
        floatingZoomLabel: document.getElementById('floatingZoomLabel'),
        zoomPercentLabel: document.getElementById('statusZoomPercent'),
        zoomSlider: document.getElementById('zoomSlider'),
        activeToolBadge: document.getElementById('activeToolBadge'),
        propColor: document.getElementById('propColor'),
        propFontSize: document.getElementById('propFontSize'),
        propStrokeWidth: document.getElementById('propStrokeWidth'),
        propStampText: document.getElementById('propStampText')
    };

    // =========================================================================
    // Utility Helpers
    // =========================================================================
    function uid() {
        return 'id_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        var k = 1024;
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function setStatus(msg) {
        if (el.statusText) {
            el.statusText.textContent = msg;
        }
    }

    function setProgress(percent, label) {
        if (percent === null || percent === undefined) {
            el.statusProgressWrap.classList.remove('active');
            return;
        }
        el.statusProgressWrap.classList.add('active');
        var clamped = Math.max(0, Math.min(100, Math.round(percent)));
        el.statusProgressFill.style.width = clamped + '%';
        el.statusProgressLabel.textContent = label || (clamped + '%');
    }

    function showToast(message, type) {
        var container = document.getElementById('toastContainer');
        if (!container) return;
        var toast = document.createElement('div');
        toast.className = 'toast';
        if (type === 'error') {
            toast.style.borderLeftColor = '#ef4444';
        } else if (type === 'success') {
            toast.style.borderLeftColor = '#10b981';
        }
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3800);
    }

    /**
     * Secure fetch wrapper that automatically includes the session CSRF token
     */
    async function apiFetch(url, options) {
        var opts = options ? Object.assign({}, options) : {};
        opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};
        if (state.csrfToken) {
            opts.headers['X-CSRF-Token'] = state.csrfToken;
        }
        if (opts.body instanceof FormData && state.csrfToken && !opts.body.has('csrf_token')) {
            opts.body.append('csrf_token', state.csrfToken);
        }
        var resp = await fetch(url, opts);
        return resp;
    }

    function updateCsrfFromData(data) {
        if (data && data.csrf_token) {
            state.csrfToken = data.csrf_token;
            window.PDFSTUDIO_CSRF_TOKEN = data.csrf_token;
        }
    }

    /**
     * Non-blocking usage statistics tracker for administrator report (storage/nutzungsstatistik.txt)
     */
    function trackUsageEvent(eventKey) {
        if (!eventKey) return;
        try {
            var fd = new FormData();
            fd.append('action', 'track_event');
            fd.append('event_key', eventKey);
            apiFetch('api.php?action=track_event', { method: 'POST', body: fd }).catch(function () {});
        } catch (e) {}
    }

    /**
     * Toggle Browser Fullscreen Mode to hide browser address bar and tabs
     */
    function isBrowserFullscreen() {
        return Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
    }

    function updateFullscreenUI() {
        var active = isBrowserFullscreen();
        var tbBtn = document.getElementById('btnFullscreenTitlebar');
        var rbBtn = document.getElementById('btnFullscreenRibbon');
        var rbIcon = document.getElementById('rbFullscreenIcon');
        var rbLabel = document.getElementById('rbFullscreenLabel');

        if (tbBtn) {
            tbBtn.textContent = active ? '🗗' : '⛶';
            tbBtn.title = active
                ? 'Vollbild-Modus beenden (Esc / F11)'
                : 'Vollbild-Modus umschalten — Browserelemente ausblenden (F11)';
            tbBtn.style.color = active ? 'var(--accent-primary)' : '';
        }
        if (rbBtn) {
            rbBtn.classList.toggle('active', active);
        }
        if (rbIcon) {
            rbIcon.textContent = active ? '🗗' : '⛶';
        }
        if (rbLabel) {
            rbLabel.textContent = active ? 'Normalansicht' : 'Vollbild';
        }
    }

    async function toggleFullscreen() {
        try {
            var docEl = document.documentElement;
            if (!isBrowserFullscreen()) {
                if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                } else if (docEl.webkitRequestFullscreen) {
                    docEl.webkitRequestFullscreen();
                } else if (docEl.msRequestFullscreen) {
                    docEl.msRequestFullscreen();
                }
                showToast('Vollbild-Modus aktiviert (Drücken Sie Esc zum Beenden)');
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
                showToast('Vollbild-Modus beendet');
            }
            updateFullscreenUI();
        } catch (err) {
            showToast('Vollbild-Modus konnte vom Browser nicht aktiviert werden: ' + err.message, 'error');
        }
    }

    function getActiveDoc() {
        for (var i = 0; i < state.tabs.length; i++) {
            if (state.tabs[i].id === state.activeTabId) {
                return state.tabs[i];
            }
        }
        return null;
    }

    function getPageAnnotations(doc, pageIndex) {
        if (!doc.annotations[pageIndex]) {
            doc.annotations[pageIndex] = [];
        }
        return doc.annotations[pageIndex];
    }

    function hexToRgbNormalized(hex) {
        var clean = (hex || '#000000').replace('#', '');
        if (clean.length === 3) {
            clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
        }
        var num = parseInt(clean, 16);
        return {
            r: ((num >> 16) & 255) / 255,
            g: ((num >> 8) & 255) / 255,
            b: (num & 255) / 255
        };
    }

    function downloadBlob(bytes, filename, mimeType) {
        var blob = new Blob([bytes], { type: mimeType || 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 2000);
    }

    // =========================================================================
    // View Mode & Ribbon Navigation
    // =========================================================================
    function switchRibbonTab(tabName) {
        var deck = document.getElementById('ribbonDeck');
        if (deck) {
            deck.classList.remove('collapsed');
            var toggleBtn = document.getElementById('btnToggleRibbonDeck');
            if (toggleBtn) toggleBtn.textContent = '▴';
        }

        var tabs = document.querySelectorAll('.ribbon-tab[data-ribbon]');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-ribbon') === tabName);
        }

        var panes = document.querySelectorAll('.ribbon-pane[data-ribbon-pane]');
        for (var j = 0; j < panes.length; j++) {
            panes[j].classList.toggle('active', panes[j].getAttribute('data-ribbon-pane') === tabName);
        }
    }

    function switchView(mode) {
        state.viewMode = mode;
        document.getElementById('viewLauncher').classList.toggle('hidden', mode !== 'launcher');
        document.getElementById('viewOrganizer').classList.toggle('hidden', mode !== 'organizer');
        document.getElementById('viewEditor').classList.toggle('hidden', mode !== 'editor');

        document.getElementById('modeBtnLauncher').classList.toggle('active', mode === 'launcher');
        document.getElementById('modeBtnOrganizer').classList.toggle('active', mode === 'organizer');
        document.getElementById('modeBtnEditor').classList.toggle('active', mode === 'editor');

        if (mode === 'organizer') {
            switchRibbonTab('pages');
            renderOrganizerGrid();
        } else if (mode === 'editor') {
            switchRibbonTab('edit');
            renderCurrentEditorPage();
        } else if (mode === 'launcher') {
            switchRibbonTab('home');
        }
        updateAssistantContextBanner();
    }

    function switchLeftDockTab(tabName) {
        var buttons = document.querySelectorAll('.dock-tab');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('active', buttons[i].getAttribute('data-docktab') === tabName);
        }
        document.getElementById('dockPanelPages').classList.toggle('hidden', tabName !== 'pages');
        document.getElementById('dockPanelTray').classList.toggle('hidden', tabName !== 'tray');
        document.getElementById('dockPanelServer').classList.toggle('hidden', tabName !== 'server');

        if (tabName === 'server') {
            loadServerWorkspaceFiles();
        }
    }

    // =========================================================================
    // Document Tab Management
    // =========================================================================
    async function addDocumentTab(name, pdfBytes, switchMode) {
        try {
            setStatus('Lade Dokument: ' + name + ' …');
            var uint8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
            var pdfDoc = await PDFLib.PDFDocument.load(uint8, { ignoreEncryption: true });
            var pageCount = pdfDoc.getPageCount();

            var newTab = {
                id: uid(),
                name: name || 'Unbenannt.pdf',
                bytes: uint8,
                pageCount: pageCount,
                currentPage: 0, // 0-indexed
                annotations: {},
                modified: false,
                meta: {
                    title: pdfDoc.getTitle() || '',
                    author: pdfDoc.getAuthor() || '',
                    subject: pdfDoc.getSubject() || ''
                }
            };

            state.tabs.push(newTab);
            state.activeTabId = newTab.id;

            populateMetadataInspector(newTab);
            renderTabsBar();
            await renderSidebarThumbnails();

            if (switchMode) {
                switchView(switchMode);
            } else if (state.viewMode === 'launcher') {
                switchView('editor');
            } else {
                switchView(state.viewMode);
            }

            updateStatusBarInfo();
            setStatus('Dokument geladen: ' + newTab.name + ' (' + pageCount + ' Seiten)');
            return newTab;
        } catch (err) {
            console.error(err);
            showToast('PDF konnte nicht geladen werden: ' + err.message, 'error');
            setStatus('Fehler beim Laden des PDFs');
            return null;
        }
    }

    function populateMetadataInspector(doc) {
        if (!doc) return;
        document.getElementById('metaTitle').value = doc.meta.title || '';
        document.getElementById('metaAuthor').value = doc.meta.author || '';
        document.getElementById('metaSubject').value = doc.meta.subject || '';
        updateAccessibilityUI(false);
    }

    function renderTabsBar() {
        el.tabsList.innerHTML = '';
        state.tabs.forEach(function (tab) {
            var btn = document.createElement('div');
            btn.className = 'doc-tab' + (tab.id === state.activeTabId ? ' active' : '');
            btn.innerHTML =
                '<span>📄 ' + escapeHtml(tab.name) + (tab.modified ? ' *' : '') + '</span>' +
                '<span class="doc-tab-badge">' + tab.pageCount + ' S.</span>' +
                '<button type="button" class="doc-tab-close" title="Tab schließen">×</button>';

            btn.addEventListener('click', function (e) {
                if (e.target && e.target.closest && e.target.closest('.doc-tab-close')) {
                    e.stopPropagation();
                    closeDocumentTab(tab.id);
                    return;
                }
                if (e.target && e.target.classList && e.target.classList.contains('doc-tab-close')) {
                    e.stopPropagation();
                    closeDocumentTab(tab.id);
                    return;
                }
                activateDocumentTab(tab.id);
            });
            el.tabsList.appendChild(btn);
        });
    }

    async function activateDocumentTab(tabId) {
        state.activeTabId = tabId;
        state.selectedAnnotationIndex = -1;
        var doc = getActiveDoc();
        renderTabsBar();
        if (doc) {
            populateMetadataInspector(doc);
            await renderSidebarThumbnails();
            if (state.viewMode === 'organizer') {
                await renderOrganizerGrid();
            } else if (state.viewMode === 'editor') {
                await renderCurrentEditorPage();
            }
            updateStatusBarInfo();
            setStatus('Dokument geladen: ' + doc.name + ' (' + doc.pageCount + (doc.pageCount === 1 ? ' Seite' : ' Seiten') + ')');
        }
    }

    function closeDocumentTab(tabId) {
        var idx = state.tabs.findIndex(function (t) { return t.id === tabId; });
        if (idx === -1) return;
        state.tabs.splice(idx, 1);

        if (state.tabs.length === 0) {
            state.activeTabId = null;
            state.selectedAnnotationIndex = -1;
            state.currentPageTextBlocks = [];
            el.thumbList.innerHTML = '';
            el.organizerGrid.innerHTML = '';
            el.leftPageSummary.textContent = 'Keine Datei geladen';
            if (el.pdfCanvas) {
                var ctx = el.pdfCanvas.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, el.pdfCanvas.width, el.pdfCanvas.height);
                el.pdfCanvas.width = 0;
                el.pdfCanvas.height = 0;
            }
            if (el.overlayLayer) {
                el.overlayLayer.innerHTML = '';
            }
            var mTitle = document.getElementById('metaTitle');
            var mAuthor = document.getElementById('metaAuthor');
            var mSubject = document.getElementById('metaSubject');
            if (mTitle) mTitle.value = '';
            if (mAuthor) mAuthor.value = '';
            if (mSubject) mSubject.value = '';
            clearPdfFullTextSearch();
            updateAccessibilityUI(false);
            renderTabsBar();
            switchView('launcher');
            updateStatusBarInfo();
            setStatus('Bereit — Kein Dokument geladen');
        } else {
            var nextTab = state.tabs[Math.max(0, idx - 1)];
            activateDocumentTab(nextTab.id);
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function updateStatusBarInfo() {
        var doc = getActiveDoc();
        if (!doc) {
            el.statusDocSize.textContent = 'Dateigröße: —';
            el.statusPageDim.textContent = 'Format: —';
            el.floatingPageIndicator.textContent = 'Seite 0 / 0';
            return;
        }
        el.statusDocSize.textContent = 'Dateigröße: ' + formatBytes(doc.bytes.byteLength);
        el.floatingPageIndicator.textContent = 'Seite ' + (doc.currentPage + 1) + ' / ' + doc.pageCount;
        el.leftPageSummary.textContent = doc.pageCount + (doc.pageCount === 1 ? ' Seite' : ' Seiten');
    }

    // =========================================================================
    // Rendering: Sidebar Thumbnails, Organizer Grid & Editor Canvas (via PDF.js)
    // =========================================================================
    async function loadPdfJsDocument(bytes) {
        if (!bytes) return null;
        if (bytes._cachedPdfJsPromise) {
            return await bytes._cachedPdfJsPromise;
        }
        // Clone buffer once so PDF.js worker does not detach our main Uint8Array buffer
        var copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        var loadingTask = window.pdfjsLib.getDocument({ data: copy });
        bytes._cachedPdfJsPromise = loadingTask.promise;
        return await bytes._cachedPdfJsPromise;
    }

    async function renderSidebarThumbnails() {
        var doc = getActiveDoc();
        el.thumbList.innerHTML = '';
        if (!doc) return;

        try {
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            doc.pageCount = pdfJsDoc.numPages;
            updateStatusBarInfo();

            for (var p = 1; p <= pdfJsDoc.numPages; p++) {
                (function (pageNumber) {
                    var pageIndex = pageNumber - 1;
                    var item = document.createElement('div');
                    item.className = 'thumb-item' + (doc.currentPage === pageIndex ? ' active' : '');
                    item.setAttribute('draggable', 'true');
                    item.setAttribute('data-page-index', String(pageIndex));

                    var canvasWrap = document.createElement('div');
                    canvasWrap.className = 'thumb-canvas-wrap';
                    var canvas = document.createElement('canvas');
                    canvasWrap.appendChild(canvas);

                    var footer = document.createElement('div');
                    footer.className = 'thumb-footer';
                    footer.innerHTML =
                        '<span>Seite ' + pageNumber + '</span>' +
                        '<div class="thumb-quick-actions">' +
                        '  <button type="button" class="thumb-icon-btn" data-act="rot-l" title="Links drehen">⟲</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="rot-r" title="Rechts drehen">⟳</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="tray" title="In Sammelmappe">+</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="del" title="Seite löschen">✕</button>' +
                        '</div>';

                    item.appendChild(canvasWrap);
                    item.appendChild(footer);
                    el.thumbList.appendChild(item);

                    // Render thumbnail asynchronously
                    pdfJsDoc.getPage(pageNumber).then(function (pdfPage) {
                        var viewport = pdfPage.getViewport({ scale: 0.28 });
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        var ctx = canvas.getContext('2d');
                        pdfPage.render({ canvasContext: ctx, viewport: viewport });
                    });

                    // Click to select page
                    item.addEventListener('click', function (e) {
                        var btn = e.target.closest('button[data-act]');
                        if (btn) {
                            e.stopPropagation();
                            var act = btn.getAttribute('data-act');
                            if (act === 'rot-l') rotatePageAt(pageIndex, -90);
                            if (act === 'rot-r') rotatePageAt(pageIndex, 90);
                            if (act === 'tray') addPageToTray(pageIndex);
                            if (act === 'del') deletePageAt(pageIndex);
                            return;
                        }
                        doc.currentPage = pageIndex;
                        state.selectedAnnotationIndex = -1;
                        highlightActiveThumbnail();
                        if (state.viewMode === 'launcher') {
                            switchView('editor');
                        } else if (state.viewMode === 'editor') {
                            renderCurrentEditorPage();
                        }
                        updateStatusBarInfo();
                    });

                    // Context menu on thumbnail
                    item.addEventListener('contextmenu', function (e) {
                        e.preventDefault();
                        doc.currentPage = pageIndex;
                        highlightActiveThumbnail();
                        openContextMenu(e.clientX, e.clientY, pageIndex);
                    });

                    // Drag & Drop page reordering
                    setupDragAndDropPageItem(item, pageIndex);
                })(p);
            }
        } catch (err) {
            console.error('Thumbnail error:', err);
        }
    }

    function highlightActiveThumbnail() {
        var doc = getActiveDoc();
        if (!doc) return;
        var items = el.thumbList.querySelectorAll('.thumb-item');
        for (var i = 0; i < items.length; i++) {
            var idx = parseInt(items[i].getAttribute('data-page-index'), 10);
            items[i].classList.toggle('active', idx === doc.currentPage);
        }
    }

    async function renderOrganizerGrid() {
        var doc = getActiveDoc();
        el.organizerGrid.innerHTML = '';
        if (!doc) return;
        var cardMinW = Math.max(120, Math.min(380, Math.round(168 * (state.zoom || 1.1))));
        el.organizerGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(' + cardMinW + 'px, 1fr))';

        try {
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            for (var p = 1; p <= pdfJsDoc.numPages; p++) {
                (function (pageNumber) {
                    var pageIndex = pageNumber - 1;
                    var card = document.createElement('div');
                    card.className = 'org-page-card' + (doc.currentPage === pageIndex ? ' selected' : '');
                    card.setAttribute('draggable', 'true');
                    card.setAttribute('data-page-index', String(pageIndex));

                    var preview = document.createElement('div');
                    preview.className = 'org-page-preview';
                    var canvas = document.createElement('canvas');
                    preview.appendChild(canvas);

                    var bar = document.createElement('div');
                    bar.className = 'thumb-footer';
                    bar.innerHTML =
                        '<strong>Seite ' + pageNumber + '</strong>' +
                        '<div class="thumb-quick-actions">' +
                        '  <button type="button" class="thumb-icon-btn" data-act="rot-l" title="Links drehen">⟲</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="rot-r" title="Rechts drehen">⟳</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="tray" title="In Sammelmappe">+</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="edit" title="Im Editor bearbeiten">✎</button>' +
                        '  <button type="button" class="thumb-icon-btn" data-act="del" title="Löschen">✕</button>' +
                        '</div>';

                    card.appendChild(preview);
                    card.appendChild(bar);
                    el.organizerGrid.appendChild(card);

                    pdfJsDoc.getPage(pageNumber).then(function (pdfPage) {
                        var orgScale = Math.max(0.22, Math.min(0.95, 0.38 * (state.zoom || 1.1)));
                        var viewport = pdfPage.getViewport({ scale: orgScale });
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
                    });

                    card.addEventListener('click', function (e) {
                        var btn = e.target.closest('button[data-act]');
                        if (btn) {
                            e.stopPropagation();
                            var act = btn.getAttribute('data-act');
                            if (act === 'rot-l') rotatePageAt(pageIndex, -90);
                            if (act === 'rot-r') rotatePageAt(pageIndex, 90);
                            if (act === 'tray') addPageToTray(pageIndex);
                            if (act === 'edit') {
                                doc.currentPage = pageIndex;
                                switchView('editor');
                            }
                            if (act === 'del') deletePageAt(pageIndex);
                            return;
                        }
                        doc.currentPage = pageIndex;
                        var cards = el.organizerGrid.querySelectorAll('.org-page-card');
                        for (var c = 0; c < cards.length; c++) {
                            var cIdx = parseInt(cards[c].getAttribute('data-page-index'), 10);
                            cards[c].classList.toggle('selected', cIdx === pageIndex);
                        }
                        highlightActiveThumbnail();
                        updateStatusBarInfo();
                    });

                    setupDragAndDropPageItem(card, pageIndex);
                })(p);
            }
        } catch (err) {
            console.error('Organizer render error:', err);
        }
    }

    function setupDragAndDropPageItem(element, pageIndex) {
        element.addEventListener('dragstart', function (e) {
            state.isInternalDrag = true;
            element.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(pageIndex));
        });
        element.addEventListener('dragend', function () {
            state.isInternalDrag = false;
            element.classList.remove('dragging');
            var dropOverlay = document.getElementById('dropOverlay');
            if (dropOverlay) dropOverlay.classList.remove('visible');
        });
        element.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        element.addEventListener('drop', function (e) {
            state.isInternalDrag = false;
            var dropOverlay = document.getElementById('dropOverlay');
            if (dropOverlay) dropOverlay.classList.remove('visible');
            e.preventDefault();
            var fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
            var toIndex = pageIndex;
            if (!isNaN(fromIndex) && fromIndex !== toIndex) {
                reorderPage(fromIndex, toIndex);
            }
        });
    }

    async function renderCurrentEditorPage() {
        var doc = getActiveDoc();
        if (!doc) return;

        try {
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            if (doc.currentPage >= pdfJsDoc.numPages) {
                doc.currentPage = Math.max(0, pdfJsDoc.numPages - 1);
            }
            var page = await pdfJsDoc.getPage(doc.currentPage + 1);
            var viewport = page.getViewport({ scale: state.zoom });

            el.pdfCanvas.width = viewport.width;
            el.pdfCanvas.height = viewport.height;
            el.annCanvas.width = viewport.width;
            el.annCanvas.height = viewport.height;
            el.stageWrapper.style.width = viewport.width + 'px';
            el.stageWrapper.style.height = viewport.height + 'px';

            // Calculate physical size in mm (72 pt = 25.4 mm)
            var baseViewport = page.getViewport({ scale: 1.0 });
            var widthMm = Math.round((baseViewport.width / 72) * 25.4);
            var heightMm = Math.round((baseViewport.height / 72) * 25.4);
            el.statusPageDim.textContent = 'Format: ' + widthMm + ' × ' + heightMm + ' mm';

            var ctx = el.pdfCanvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            state.currentPageTextBlocks = await extractPageTextBlocks(page, baseViewport);

            var pctText = Math.round(state.zoom * 100) + '%';
            if (el.floatingZoomLabel) el.floatingZoomLabel.textContent = pctText;
            if (el.zoomPercentLabel) el.zoomPercentLabel.textContent = pctText;
            if (el.zoomSlider) el.zoomSlider.value = Math.round(state.zoom * 100);
            updateStatusBarInfo();
            highlightActiveThumbnail();
            redrawAnnotationOverlay();
        } catch (err) {
            console.error('Editor render error:', err);
        }
    }

    async function extractPageTextBlocks(page, baseViewport) {
        try {
            var tc = await page.getTextContent();
            var raw = [];
            var items = (tc && tc.items) ? tc.items : [];
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (!it || typeof it.str !== 'string' || it.str.trim() === '') continue;
                var tr = it.transform || [12, 0, 0, 12, 0, 0];
                var fSize = Math.sqrt(tr[0] * tr[0] + tr[1] * tr[1]) || Math.sqrt(tr[2] * tr[2] + tr[3] * tr[3]) || it.height || 12;
                fSize = Math.max(7, Math.min(96, Math.round(fSize * 10) / 10));

                // Convert raw PDF text coordinates (tr[4], tr[5]) into visual viewport coordinates
                // so rotated pages (/Rotate 90, 180, 270) and non-zero MediaBox/CropBox origins map 100% accurately
                var vpPt = baseViewport.convertToViewportPoint(tr[4], tr[5]);
                var vx = vpPt[0];
                var vy = vpPt[1];
                var topY = vy - (fSize * 0.88);
                var w = (it.width && it.width > 0) ? it.width : (it.str.length * fSize * 0.52);
                var h = Math.max(fSize * 1.26, (it.height || fSize) * 1.15);
                raw.push({
                    text: it.str,
                    x: vx,
                    y: topY,
                    w: w,
                    h: h,
                    fontSize: Math.round(fSize)
                });
            }

            // Sort top-to-bottom (with same-line tolerance), then left-to-right
            raw.sort(function (a, b) {
                var tol = Math.max(a.fontSize, b.fontSize) * 0.45;
                if (Math.abs(a.y - b.y) > tol) {
                    return a.y - b.y;
                }
                return a.x - b.x;
            });

            var merged = [];
            for (var j = 0; j < raw.length; j++) {
                var cur = raw[j];
                if (merged.length > 0) {
                    var prev = merged[merged.length - 1];
                    var sameLine = Math.abs(cur.y - prev.y) <= Math.max(prev.fontSize, cur.fontSize) * 0.45;
                    var gap = cur.x - (prev.x + prev.w);
                    if (sameLine && gap >= -4 && gap <= Math.max(prev.fontSize, cur.fontSize) * 1.6) {
                        var needsSpace = gap > (prev.fontSize * 0.18) && prev.text.slice(-1) !== ' ' && cur.text.charAt(0) !== ' ';
                        prev.text = prev.text + (needsSpace ? ' ' : '') + cur.text;
                        var rightEdge = Math.max(prev.x + prev.w, cur.x + cur.w);
                        prev.x = Math.min(prev.x, cur.x);
                        prev.y = Math.min(prev.y, cur.y);
                        prev.w = rightEdge - prev.x;
                        prev.h = Math.max(prev.h, cur.h);
                        continue;
                    }
                }
                merged.push(cur);
            }
            return merged;
        } catch (e) {
            return [];
        }
    }

    // =========================================================================
    // Interactive Annotation Overlay Engine (Text, Edit-Text, Pen, Highlight, Redact, Stamp, Signature, Image, AcroForms, Links, PDF/UA Tags)
    // =========================================================================
    function setActiveTool(toolName, extraAttr) {
        state.activeTool = toolName;
        if (extraAttr) {
            state.activeTagType = extraAttr;
        }
        state.selectedAnnotationIndex = -1;
        var toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
        for (var i = 0; i < toolBtns.length; i++) {
            var isMatch = toolBtns[i].getAttribute('data-tool') === toolName;
            if (toolName === 'a11y-tag' && extraAttr) {
                isMatch = isMatch && toolBtns[i].getAttribute('data-tagtype') === extraAttr;
            }
            toolBtns[i].classList.toggle('active', isMatch);
        }
        var labels = {
            select: 'Auswahl / Bewegen',
            'edit-text': 'Originaltext im PDF ändern',
            text: 'Neuen Text einfügen',
            pen: 'Freihand-Stift',
            highlight: 'Textmarker',
            strikethrough: 'Text durchstreichen',
            redact: 'Schwärzen',
            rect: 'Rechteck',
            stamp: 'Stempel',
            'form-text': 'Formular: Textfeld',
            'form-check': 'Formular: Checkbox',
            'form-select': 'Formular: Dropdown',
            link: 'Hyperlink / Sprungmarke',
            'a11y-tag': 'PDF/UA Tag: ' + (state.activeTagType || 'P'),
            'tts-click': 'Vorlesen: Textzeile anklicken'
        };
        el.activeToolBadge.textContent = labels[toolName] || toolName;
        if (toolName === 'text' || toolName === 'pen' || toolName === 'highlight' || toolName === 'strikethrough' || toolName === 'rect' || toolName === 'stamp' || toolName === 'redact') {
            revealRightDockSection('inspectorToolSection', toolName === 'stamp' ? 'propStampText' : null);
        } else if (toolName === 'tts-click') {
            revealRightDockSection('inspectorOcrSection');
        }
        el.annCanvas.style.cursor = toolName === 'select' ? 'default' : (toolName === 'tts-click' ? 'pointer' : ((toolName === 'edit-text' || toolName === 'strikethrough') ? 'text' : 'crosshair'));
        if (toolName === 'edit-text' && getActiveDoc()) {
            if (!state.currentPageTextBlocks || state.currentPageTextBlocks.length === 0) {
                showToast('Hinweis: Diese Seite enthält keinen eingebetteten Text (Scan). Nutzen Sie erst "Durchsuchbares PDF (OCR)" oder "T+ Neuer Text".');
            } else {
                showToast('Klicken Sie direkt auf eine blau markierte Textzeile im PDF, um sie umzuschreiben.');
            }
        } else if (toolName === 'strikethrough' && getActiveDoc()) {
            showToast('Klicken Sie direkt auf eine Textzeile oder ziehen Sie mit gedrückter Maustaste über einzelne Wörter zum Durchstreichen.');
        } else if (toolName === 'tts-click' && getActiveDoc()) {
            if (!state.currentPageTextBlocks || state.currentPageTextBlocks.length === 0) {
                showToast('Hinweis: Diese Seite ist ein reiner Bild-Scan ohne Textebene. Starten Sie erst „🔎 Durchsuchbares PDF (OCR)“, um Zeilen anzuklicken.');
            } else {
                showToast('Klicken Sie direkt auf eine grün umrahmte Textzeile im PDF, um ab dieser Stelle laut vorzulesen.');
            }
        }
        redrawAnnotationOverlay();
        updateAssistantContextBanner();
    }

    function redrawAnnotationOverlay() {
        var doc = getActiveDoc();
        var ctx = el.annCanvas.getContext('2d');
        ctx.clearRect(0, 0, el.annCanvas.width, el.annCanvas.height);
        if (!doc) return;

        var list = getPageAnnotations(doc, doc.currentPage);
        var scale = state.zoom;

        // When in 'edit-text', 'strikethrough', or 'tts-click' mode, highlight all detected embedded PDF text blocks so user sees clickable lines
        if ((state.activeTool === 'edit-text' || state.activeTool === 'strikethrough' || state.activeTool === 'tts-click') && state.currentPageTextBlocks && state.currentPageTextBlocks.length > 0) {
            ctx.save();
            var isStrikeMode = state.activeTool === 'strikethrough';
            var isTtsClickMode = state.activeTool === 'tts-click';
            for (var b = 0; b < state.currentPageTextBlocks.length; b++) {
                var blk = state.currentPageTextBlocks[b];
                if (!isStrikeMode && !isTtsClickMode) {
                    var alreadyReplaced = false;
                    for (var k = 0; k < list.length; k++) {
                        if (list[k].type === 'edit-text' && Math.abs((list[k].origX || 0) - blk.x) < 4 && Math.abs((list[k].origY || 0) - blk.y) < 4) {
                            alreadyReplaced = true;
                            break;
                        }
                    }
                    if (alreadyReplaced) continue;
                }
                if (isTtsClickMode) {
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.07)';
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.50)';
                } else if (isStrikeMode) {
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
                    ctx.strokeStyle = 'rgba(220, 38, 38, 0.40)';
                } else {
                    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
                    ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)';
                }
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 2]);
                ctx.fillRect(blk.x * scale, blk.y * scale, blk.w * scale, blk.h * scale);
                ctx.strokeRect(blk.x * scale, blk.y * scale, blk.w * scale, blk.h * scale);
            }
            ctx.restore();
        }

        // Highlight currently spoken Text-to-Speech (TTS) line in emerald green
        if (state.ttsSpeaking && state.ttsActiveBlockIndex >= 0 && state.currentPageTextBlocks && state.currentPageTextBlocks[state.ttsActiveBlockIndex]) {
            var ttsBlk = state.currentPageTextBlocks[state.ttsActiveBlockIndex];
            ctx.save();
            ctx.fillStyle = 'rgba(16, 185, 129, 0.26)';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            var tx = Math.max(0, (ttsBlk.x - 3) * scale);
            var ty = Math.max(0, (ttsBlk.y - 2) * scale);
            var tw = (ttsBlk.w + 6) * scale;
            var th = (ttsBlk.h + 4) * scale;
            ctx.fillRect(tx, ty, tw, th);
            ctx.strokeRect(tx, ty, tw, th);
            ctx.fillStyle = '#059669';
            ctx.font = 'bold ' + Math.max(11, Math.round(12 * scale)) + 'px sans-serif';
            ctx.fillText('🔊', Math.max(2, tx - 18 * scale), ty + th * 0.78);
            ctx.restore();
        }

        // Highlight PDF full-text search matches (Strg+F / Search bar) on current page
        if (state.pdfSearchMatches && state.pdfSearchMatches.length > 0) {
            ctx.save();
            for (var sIdx = 0; sIdx < state.pdfSearchMatches.length; sIdx++) {
                var sm = state.pdfSearchMatches[sIdx];
                if (sm.pageIndex !== doc.currentPage) continue;
                var isActiveMatch = (sIdx === state.pdfSearchActiveIdx);
                ctx.fillStyle = isActiveMatch ? 'rgba(249, 115, 22, 0.45)' : 'rgba(250, 204, 21, 0.40)';
                ctx.strokeStyle = isActiveMatch ? '#ea580c' : '#ca8a04';
                ctx.lineWidth = isActiveMatch ? 2 : 1;
                ctx.fillRect(sm.x * scale, sm.y * scale, sm.w * scale, sm.h * scale);
                ctx.strokeRect(sm.x * scale, sm.y * scale, sm.w * scale, sm.h * scale);
            }
            ctx.restore();
        }

        for (var i = 0; i < list.length; i++) {
            drawSingleAnnotation(ctx, list[i], scale, i === state.selectedAnnotationIndex);
        }
        if (state.currentDraftAnnotation) {
            drawSingleAnnotation(ctx, state.currentDraftAnnotation, scale, false);
        }
    }

    function drawSingleAnnotation(ctx, ann, scale, isSelected) {
        ctx.save();
        var x = ann.x * scale;
        var y = ann.y * scale;
        var w = (ann.w || 0) * scale;
        var h = (ann.h || 0) * scale;

        if (ann.type === 'edit-text') {
            var ox = (ann.origX !== undefined ? ann.origX : ann.x) * scale;
            var oy = (ann.origY !== undefined ? ann.origY : ann.y) * scale;
            var ow = (ann.origW !== undefined ? ann.origW : (ann.w || 60)) * scale;
            var oh = (ann.origH !== undefined ? ann.origH : (ann.h || 20)) * scale;
            // Whiteout mask covering original embedded PDF text
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(ox - 1.5 * scale, oy - 1 * scale, ow + 3 * scale, oh + 2 * scale);

            var editFontSize = (ann.fontSize || 12) * scale;
            ctx.font = '400 ' + editFontSize + 'px Helvetica, Arial, sans-serif';
            ctx.fillStyle = ann.color || '#0f172a';
            ctx.textBaseline = 'top';
            if (ann.text) {
                ctx.fillText(ann.text, x, y + (editFontSize * 0.08));
                var editMetrics = ctx.measureText(ann.text);
                w = Math.max(editMetrics.width, 24 * scale);
            } else {
                w = ow;
            }
            h = Math.max(editFontSize * 1.26, oh);
            ann.w = w / scale;
            ann.h = h / scale;

            if (state.activeTool === 'edit-text' && !isSelected) {
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 2]);
                ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
                ctx.setLineDash([]);
            }
        } else if (ann.type === 'text') {
            var fontSize = (ann.fontSize || 18) * scale;
            ctx.font = '600 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = ann.color || '#dc2626';
            ctx.textBaseline = 'top';
            ctx.fillText(ann.text || '', x, y);
            var metrics = ctx.measureText(ann.text || '');
            w = metrics.width;
            h = fontSize * 1.2;
            ann.w = w / scale;
            ann.h = h / scale;
        } else if (ann.type === 'redact') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(x, y, w, h);
        } else if (ann.type === 'highlight') {
            ctx.fillStyle = ann.color || '#eab308';
            ctx.globalAlpha = 0.36;
            ctx.fillRect(x, y, w, h);
        } else if (ann.type === 'strikethrough') {
            var stLineColor = ann.color || '#dc2626';
            if (isSelected || state.activeTool === 'strikethrough') {
                ctx.fillStyle = stLineColor;
                ctx.globalAlpha = 0.10;
                ctx.fillRect(x, y, w, h);
                ctx.globalAlpha = 1;
            }
            ctx.strokeStyle = stLineColor;
            ctx.lineWidth = Math.max(1.8, (ann.strokeWidth || 2.5)) * scale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            var midStrikeY = y + (h > 0 ? h * 0.52 : 7 * scale);
            ctx.moveTo(x, midStrikeY);
            ctx.lineTo(x + w, midStrikeY);
            ctx.stroke();
        } else if (ann.type === 'rect') {
            ctx.strokeStyle = ann.color || '#dc2626';
            ctx.lineWidth = (ann.strokeWidth || 3) * scale;
            ctx.strokeRect(x, y, w, h);
        } else if (ann.type === 'pen' && ann.points && ann.points.length > 1) {
            ctx.strokeStyle = ann.color || '#dc2626';
            ctx.lineWidth = (ann.strokeWidth || 3) * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(ann.points[0].x * scale, ann.points[0].y * scale);
            for (var p = 1; p < ann.points.length; p++) {
                ctx.lineTo(ann.points[p].x * scale, ann.points[p].y * scale);
            }
            ctx.stroke();
        } else if (ann.type === 'stamp') {
            var stColor = ann.color || '#dc2626';
            var stFontSize = 20 * scale;
            ctx.font = '800 ' + stFontSize + 'px sans-serif';
            var txt = ann.text || 'BEZAHLT';
            var tw = ctx.measureText(txt).width + 24 * scale;
            var th = 38 * scale;
            w = tw;
            h = th;
            ann.w = tw / scale;
            ann.h = th / scale;

            ctx.strokeStyle = stColor;
            ctx.lineWidth = 3 * scale;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
            ctx.fillRect(x, y, tw, th);
            ctx.strokeRect(x, y, tw, th);
            ctx.fillStyle = stColor;
            ctx.textBaseline = 'middle';
            ctx.fillText(txt, x + 12 * scale, y + th / 2);
        } else if (ann.type === 'image' && ann.imgElement) {
            ctx.drawImage(ann.imgElement, x, y, w, h);
        } else if (ann.type === 'form-text' || ann.type === 'form-select') {
            ctx.fillStyle = 'rgba(219, 234, 254, 0.78)';
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#1e3a8a';
            ctx.font = '600 ' + Math.round(11 * scale) + 'px sans-serif';
            ctx.textBaseline = 'middle';
            var fLabel = (ann.type === 'form-select' ? '▾ ' : '⌨ ') + (ann.fieldName || 'Feld') + ': ' + (ann.defaultValue || '');
            ctx.fillText(fLabel, x + 6 * scale, y + h / 2);
        } else if (ann.type === 'form-check') {
            ctx.fillStyle = 'rgba(219, 234, 254, 0.85)';
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#1e3a8a';
            ctx.font = '700 ' + Math.round(13 * scale) + 'px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(ann.checked ? '✓' : '', x + 4 * scale, y + h / 2);
        } else if (ann.type === 'link') {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.14)';
            ctx.strokeStyle = '#2563eb';
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1.5;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = '#1d4ed8';
            ctx.font = '600 ' + Math.round(10 * scale) + 'px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText('🔗 ' + (ann.target || ''), x + 4 * scale, y + 3 * scale);
        } else if (ann.type === 'a11y-tag') {
            ctx.fillStyle = 'rgba(139, 92, 246, 0.14)';
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 2;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            var tagBadge = '#' + (ann.order || 1) + ' <' + (ann.tagType || 'P') + '>' + (ann.altText ? ' Alt: "' + ann.altText + '"' : '');
            ctx.fillStyle = '#6d28d9';
            ctx.fillRect(x, Math.max(0, y - 16 * scale), Math.min(w, ctx.measureText(tagBadge).width + 18 * scale), 16 * scale);
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 ' + Math.round(10 * scale) + 'px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText(tagBadge, x + 4 * scale, Math.max(2, y - 14 * scale));
        }

        if (isSelected) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
        }
        ctx.restore();
    }

    function getCanvasCoords(e) {
        var rect = el.annCanvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / state.zoom,
            y: (e.clientY - rect.top) / state.zoom
        };
    }

    function findAnnotationAt(x, y) {
        var doc = getActiveDoc();
        if (!doc) return -1;
        var list = getPageAnnotations(doc, doc.currentPage);
        for (var i = list.length - 1; i >= 0; i--) {
            var a = list[i];
            var ax = a.x;
            var ay = a.y;
            var aw = a.w || 60;
            var ah = a.h || 30;
            if (x >= ax && x <= ax + aw && y >= ay && y <= ay + ah) {
                return i;
            }
        }
        return -1;
    }

    function promptEditAnnotationAt(doc, idx) {
        if (!doc || idx < 0) return false;
        var list = getPageAnnotations(doc, doc.currentPage);
        var ann = list[idx];
        if (!ann) return false;
        if (ann.type === 'edit-text' || ann.type === 'text' || ann.type === 'stamp') {
            var promptTitle = ann.type === 'edit-text'
                ? 'Originaltext im PDF ändern (leer lassen, um die Textstelle zu entfernen):'
                : 'Text bearbeiten:';
            var updated = window.prompt(promptTitle, ann.text || '');
            if (updated === null) return true;
            if (ann.type === 'text' && updated.trim() === '') {
                list.splice(idx, 1);
                state.selectedAnnotationIndex = -1;
            } else {
                ann.text = updated;
            }
            doc.modified = true;
            renderTabsBar();
            redrawAnnotationOverlay();
            return true;
        }
        return false;
    }

    function setupAnnotationCanvasEvents() {
        el.annCanvas.addEventListener('dblclick', function (e) {
            var doc = getActiveDoc();
            if (!doc) return;
            var pt = getCanvasCoords(e);
            var hitIdx = findAnnotationAt(pt.x, pt.y);
            if (hitIdx !== -1) {
                state.selectedAnnotationIndex = hitIdx;
                promptEditAnnotationAt(doc, hitIdx);
            }
        });

        el.annCanvas.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var doc = getActiveDoc();
            if (!doc) return;

            var pt = getCanvasCoords(e);
            var color = el.propColor.value || '#dc2626';
            var fontSize = parseInt(el.propFontSize.value, 10) || 18;
            var strokeWidth = parseInt(el.propStrokeWidth.value, 10) || 3;
            var list = getPageAnnotations(doc, doc.currentPage);

            if (state.activeTool === 'select') {
                var hitIdx = findAnnotationAt(pt.x, pt.y);
                state.selectedAnnotationIndex = hitIdx;
                if (hitIdx !== -1) {
                    var selAnn = list[hitIdx];
                    if (selAnn.color && el.propColor) el.propColor.value = selAnn.color;
                    if (selAnn.fontSize && el.propFontSize) el.propFontSize.value = selAnn.fontSize;
                    if (selAnn.strokeWidth && el.propStrokeWidth) el.propStrokeWidth.value = selAnn.strokeWidth;
                    revealRightDockSection('inspectorToolSection');
                    state.isDrawing = true;
                    state.dragMode = 'move-ann';
                    state.dragOffset.x = pt.x - selAnn.x;
                    state.dragOffset.y = pt.y - selAnn.y;
                }
                redrawAnnotationOverlay();
                return;
            }

            if (state.activeTool === 'tts-click') {
                var ttsBlocks = state.currentPageTextBlocks || [];
                var hitTtsIdx = -1;
                for (var tb = 0; tb < ttsBlocks.length; tb++) {
                    var tblk = ttsBlocks[tb];
                    if (pt.x >= tblk.x - 6 && pt.x <= tblk.x + tblk.w + 10 && pt.y >= tblk.y - 4 && pt.y <= tblk.y + tblk.h + 4) {
                        hitTtsIdx = tb;
                        break;
                    }
                }
                if (hitTtsIdx !== -1) {
                    startTtsReadingFromBlock(hitTtsIdx);
                } else if (ttsBlocks.length === 0) {
                    showToast('Diese Seite enthält noch keine Textebene (Scan). Klicken Sie auf „🔎 Durchsuchbares PDF (OCR)“.', 'error');
                    revealRightDockSection('inspectorOcrSection');
                } else {
                    showToast('Bitte klicken Sie direkt auf eine grün umrahmte Textzeile im PDF, um ab dort vorzulesen.');
                }
                return;
            }

            if (state.activeTool === 'edit-text') {
                var existingHit = findAnnotationAt(pt.x, pt.y);
                if (existingHit !== -1 && (list[existingHit].type === 'edit-text' || list[existingHit].type === 'text')) {
                    state.selectedAnnotationIndex = existingHit;
                    promptEditAnnotationAt(doc, existingHit);
                    return;
                }

                var hitBlock = null;
                var blocks = state.currentPageTextBlocks || [];
                for (var b = 0; b < blocks.length; b++) {
                    var blk = blocks[b];
                    if (pt.x >= blk.x - 4 && pt.x <= blk.x + blk.w + 8 && pt.y >= blk.y - 3 && pt.y <= blk.y + blk.h + 3) {
                        hitBlock = blk;
                        break;
                    }
                }

                if (hitBlock) {
                    var newTxt = window.prompt('Originaltext im PDF ändern (leer lassen, um die Textstelle zu entfernen):', hitBlock.text);
                    if (newTxt !== null) {
                        var newAnn = {
                            type: 'edit-text',
                            origX: hitBlock.x,
                            origY: hitBlock.y,
                            origW: hitBlock.w,
                            origH: hitBlock.h,
                            x: hitBlock.x,
                            y: hitBlock.y,
                            w: hitBlock.w,
                            h: hitBlock.h,
                            fontSize: hitBlock.fontSize || 12,
                            color: '#0f172a',
                            text: newTxt
                        };
                        list.push(newAnn);
                        state.selectedAnnotationIndex = list.length - 1;
                        if (el.propFontSize) el.propFontSize.value = newAnn.fontSize;
                        if (el.propColor) el.propColor.value = newAnn.color;
                        doc.modified = true;
                        renderTabsBar();
                        redrawAnnotationOverlay();
                        trackUsageEvent('text_edited_inline');
                        showToast('Originaltext geändert (Tipp: Schriftgröße & Farbe rechts im Inspektor anpassbar)', 'success');
                    }
                } else {
                    showToast('Bitte klicken Sie auf eine blau markierte Textzeile im PDF (oder nutzen Sie "T+ Neuer Text" für freie Stellen).');
                }
                return;
            }

            if (state.activeTool === 'text') {
                var userText = window.prompt('Text für PDF-Seite eingeben:', 'Beispieltext');
                if (userText && userText.trim() !== '') {
                    list.push({
                        type: 'text',
                        x: pt.x,
                        y: pt.y,
                        text: userText,
                        color: color,
                        fontSize: fontSize,
                        w: 120,
                        h: fontSize * 1.2
                    });
                    doc.modified = true;
                    renderTabsBar();
                    redrawAnnotationOverlay();
                }
                return;
            }

            if (state.activeTool === 'stamp') {
                var stampTxt = el.propStampText.value || 'BEZAHLT';
                list.push({
                    type: 'stamp',
                    x: pt.x,
                    y: pt.y,
                    text: stampTxt,
                    color: color,
                    w: 150,
                    h: 40
                });
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
                return;
            }

            if (state.activeTool === 'form-text') {
                var fName = window.prompt('Name des ausfüllbaren Textfelds (AcroForm):', 'Textfeld_' + (list.length + 1));
                if (!fName) return;
                var fDefault = window.prompt('Standardwert / Platzhalter (optional):', '');
                list.push({
                    type: 'form-text',
                    x: pt.x,
                    y: pt.y,
                    w: 180,
                    h: 26,
                    fieldName: fName.trim(),
                    defaultValue: fDefault || ''
                });
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
                showToast('AcroForm-Textfeld platziert (mit Auswahl-Werkzeug verschiebbar)');
                return;
            }

            if (state.activeTool === 'form-check') {
                var cName = window.prompt('Name der Checkbox (AcroForm):', 'Checkbox_' + (list.length + 1));
                if (!cName) return;
                list.push({
                    type: 'form-check',
                    x: pt.x,
                    y: pt.y,
                    w: 20,
                    h: 20,
                    fieldName: cName.trim(),
                    checked: true
                });
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
                showToast('AcroForm-Checkbox platziert');
                return;
            }

            if (state.activeTool === 'form-select') {
                var sName = window.prompt('Name des Dropdown-Felds (AcroForm):', 'Auswahl_' + (list.length + 1));
                if (!sName) return;
                var sOpts = window.prompt('Auswahl-Optionen (kommagetrennt):', 'Option A, Option B, Option C');
                var parsedOpts = (sOpts || 'Option A, Option B').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                list.push({
                    type: 'form-select',
                    x: pt.x,
                    y: pt.y,
                    w: 180,
                    h: 26,
                    fieldName: sName.trim(),
                    options: parsedOpts,
                    defaultValue: parsedOpts[0] || ''
                });
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
                showToast('AcroForm-Dropdown platziert');
                return;
            }

            if (state.activeTool === 'link') {
                var target = window.prompt('Ziel-URL (z. B. https://example.org) oder Seitenzahl (z. B. 2) eingeben:', 'https://');
                if (!target) return;
                list.push({
                    type: 'link',
                    x: pt.x,
                    y: pt.y,
                    w: 160,
                    h: 28,
                    target: target.trim()
                });
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
                showToast('Klickbarer Link-Bereich angelegt');
                return;
            }

            if (state.activeTool === 'a11y-tag') {
                var tType = state.activeTagType || 'P';
                var alt = '';
                if (tType === 'Figure') {
                    alt = window.prompt('Alternativtext (/Alt) für Blinde / Screenreader eingeben:', 'Firmenlogo / Abbildung') || 'Abbildung';
                } else {
                    alt = window.prompt('Inhalt / Beschreibung für Struktur-Tag <' + tType + '> (optional):', '');
                }
                var tagCount = list.filter(function (a) { return a.type === 'a11y-tag'; }).length + 1;
                list.push({
                    type: 'a11y-tag',
                    x: pt.x,
                    y: pt.y,
                    w: 220,
                    h: 45,
                    tagType: tType,
                    altText: alt,
                    order: tagCount
                });
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
                showToast('PDF/UA Struktur-Tag <' + tType + '> (Lesereihenfolge #' + tagCount + ') gesetzt');
                return;
            }

            // Drawing tools: pen, highlight, redact, rect
            state.isDrawing = true;
            state.dragMode = 'draw';
            state.dragStart = pt;

            if (state.activeTool === 'pen') {
                state.currentDraftAnnotation = {
                    type: 'pen',
                    x: pt.x,
                    y: pt.y,
                    w: 10,
                    h: 10,
                    color: color,
                    strokeWidth: strokeWidth,
                    points: [{ x: pt.x, y: pt.y }]
                };
            } else {
                state.currentDraftAnnotation = {
                    type: state.activeTool,
                    x: pt.x,
                    y: pt.y,
                    w: 1,
                    h: 1,
                    color: color,
                    strokeWidth: strokeWidth
                };
            }
        });

        window.addEventListener('mousemove', function (e) {
            if (!state.isDrawing) return;
            var doc = getActiveDoc();
            if (!doc) return;
            var pt = getCanvasCoords(e);

            if (state.dragMode === 'move-ann' && state.selectedAnnotationIndex !== -1) {
                var list = getPageAnnotations(doc, doc.currentPage);
                var ann = list[state.selectedAnnotationIndex];
                if (ann) {
                    var dx = (pt.x - state.dragOffset.x) - ann.x;
                    var dy = (pt.y - state.dragOffset.y) - ann.y;
                    ann.x = pt.x - state.dragOffset.x;
                    ann.y = pt.y - state.dragOffset.y;
                    if (ann.type === 'pen' && ann.points) {
                        for (var i = 0; i < ann.points.length; i++) {
                            ann.points[i].x += dx;
                            ann.points[i].y += dy;
                        }
                    }
                    doc.modified = true;
                    redrawAnnotationOverlay();
                }
                return;
            }

            if (state.dragMode === 'draw' && state.currentDraftAnnotation) {
                if (state.currentDraftAnnotation.type === 'pen') {
                    state.currentDraftAnnotation.points.push({ x: pt.x, y: pt.y });
                } else {
                    state.currentDraftAnnotation.x = Math.min(state.dragStart.x, pt.x);
                    state.currentDraftAnnotation.y = Math.min(state.dragStart.y, pt.y);
                    state.currentDraftAnnotation.w = Math.abs(pt.x - state.dragStart.x);
                    state.currentDraftAnnotation.h = Math.abs(pt.y - state.dragStart.y);
                }
                redrawAnnotationOverlay();
            }
        });

        window.addEventListener('mouseup', function () {
            if (!state.isDrawing) return;
            state.isDrawing = false;
            var doc = getActiveDoc();

            if (state.dragMode === 'draw' && state.currentDraftAnnotation && doc) {
                var draft = state.currentDraftAnnotation;
                state.currentDraftAnnotation = null;
                var list = getPageAnnotations(doc, doc.currentPage);

                // For 'strikethrough': if user single-clicked (without dragging), snap to the clicked PDF text line!
                if (draft.type === 'strikethrough' && (draft.w || 0) < 6 && (draft.h || 0) < 6) {
                    var clickX = state.dragStart.x;
                    var clickY = state.dragStart.y;
                    var matchedBlk = null;
                    var pageBlks = state.currentPageTextBlocks || [];
                    for (var sb = 0; sb < pageBlks.length; sb++) {
                        var candidateBlk = pageBlks[sb];
                        if (clickX >= candidateBlk.x - 4 && clickX <= candidateBlk.x + candidateBlk.w + 8 &&
                            clickY >= candidateBlk.y - 3 && clickY <= candidateBlk.y + candidateBlk.h + 3) {
                            matchedBlk = candidateBlk;
                            break;
                        }
                    }
                    if (matchedBlk) {
                        draft.x = matchedBlk.x;
                        draft.y = matchedBlk.y;
                        draft.w = matchedBlk.w;
                        draft.h = matchedBlk.h;
                    } else {
                        draft.w = 80;
                        draft.h = 16;
                        draft.y = Math.max(0, clickY - 8);
                    }
                } else if (draft.type === 'strikethrough') {
                    if ((draft.h || 0) < 10) {
                        var centerY = draft.y + (draft.h || 0) * 0.5;
                        draft.h = 14;
                        draft.y = Math.max(0, centerY - 7);
                    }
                }

                list.push(draft);
                doc.modified = true;
                renderTabsBar();
                redrawAnnotationOverlay();
            }
            state.dragMode = null;
        });
    }

    // Wrap a page's existing content streams in q ... Q (pushGraphicsState / popGraphicsState)
    // so any unclosed cm rotation/scaling matrix from scanner or printer drivers cannot distort newly drawn text.
    // When markAsArtifact === true (e.g. background scan image in Sandwich-OCR), also wraps in /Artifact BMC ... EMC.
    function isolatePageGraphicsState(pdfPage, pdfDoc, markAsArtifact) {
        try {
            if (pdfPage && pdfPage.node && typeof pdfPage.node.normalize === 'function' &&
                typeof pdfPage.node.wrapContentStreams === 'function' &&
                PDFLib.pushGraphicsState && PDFLib.popGraphicsState) {
                pdfPage.node.normalize();
                var startOps = markAsArtifact
                    ? [PDFLib.PDFOperator.of('BMC', [PDFLib.PDFName.of('Artifact')]), PDFLib.pushGraphicsState()]
                    : [PDFLib.pushGraphicsState()];
                var endOps = markAsArtifact
                    ? [PDFLib.popGraphicsState(), PDFLib.PDFOperator.of('EMC')]
                    : [PDFLib.popGraphicsState()];
                var startStream = pdfPage.createContentStream.apply(pdfPage, startOps);
                var startRef = pdfDoc.context.register(startStream);
                var endStream = pdfPage.createContentStream.apply(pdfPage, endOps);
                var endRef = pdfDoc.context.register(endStream);
                pdfPage.node.wrapContentStreams(startRef, endRef);
            }
        } catch (e) {
            console.warn('isolatePageGraphicsState:', e);
        }
    }

    function visualRectToRawPdfRect(baseVp, vx, vy, vw, vh) {
        var p1 = baseVp.convertToPdfPoint(vx, vy);
        var p2 = baseVp.convertToPdfPoint(vx + vw, vy + vh);
        return {
            x: Math.min(p1[0], p2[0]),
            y: Math.min(p1[1], p2[1]),
            width: Math.abs(p2[0] - p1[0]),
            height: Math.abs(p2[1] - p1[1])
        };
    }

    // Bake all interactive annotations, AcroForms, Hyperlinks & PDF/UA Tags into the underlying PDF bytes via PDFLib
    async function bakeAnnotationsIntoDocument(doc) {
        if (!doc) return;
        var hasAny = false;
        for (var k in doc.annotations) {
            if (doc.annotations[k] && doc.annotations[k].length > 0) {
                hasAny = true;
                break;
            }
        }
        if (!hasAny) return;

        var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
        var helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        var helveticaRegularFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        var pages = pdfDoc.getPages();
        var form = pdfDoc.getForm();
        var context = pdfDoc.context;
        var customTagElements = [];

        for (var pageIdxStr in doc.annotations) {
            var pIdx = parseInt(pageIdxStr, 10);
            var list = doc.annotations[pIdx];
            if (!list || !list.length || !pages[pIdx]) continue;

            var page = pages[pIdx];
            isolatePageGraphicsState(page, pdfDoc);

            var jsPage = await pdfJsDoc.getPage(pIdx + 1);
            var baseVp = jsPage.getViewport({ scale: 1.0 });
            var pageRot = ((baseVp.rotation % 360) + 360) % 360;
            var textRot = PDFLib.degrees(pageRot);
            var pageSize = page.getSize();
            var pageH = pageSize.height;

            for (var i = 0; i < list.length; i++) {
                var ann = list[i];
                var rgb = hexToRgbNormalized(ann.color || '#dc2626');
                var pdfColor = PDFLib.rgb(rgb.r, rgb.g, rgb.b);

                if (ann.type === 'edit-text') {
                    var ox = ann.origX !== undefined ? ann.origX : ann.x;
                    var oy = ann.origY !== undefined ? ann.origY : ann.y;
                    var ow = ann.origW !== undefined ? ann.origW : (ann.w || 60);
                    var oh = ann.origH !== undefined ? ann.origH : (ann.h || 20);
                    var maskRect = visualRectToRawPdfRect(baseVp, Math.max(0, ox - 1.5), oy - 1, ow + 3, oh + 2);
                    page.drawRectangle({
                        x: maskRect.x,
                        y: maskRect.y,
                        width: maskRect.width,
                        height: maskRect.height,
                        color: PDFLib.rgb(1, 1, 1)
                    });
                    if (ann.text && String(ann.text).length > 0) {
                        var efSize = ann.fontSize || 12;
                        var eRgb = hexToRgbNormalized(ann.color || '#0f172a');
                        var ePt = baseVp.convertToPdfPoint(ann.x, ann.y + (efSize * 0.88));
                        page.drawText(String(ann.text), {
                            x: ePt[0],
                            y: ePt[1],
                            size: efSize,
                            font: helveticaRegularFont,
                            color: PDFLib.rgb(eRgb.r, eRgb.g, eRgb.b),
                            rotate: textRot
                        });
                    }
                } else if (ann.type === 'text') {
                    var fSize = ann.fontSize || 18;
                    var tPt = baseVp.convertToPdfPoint(ann.x, ann.y + fSize);
                    page.drawText(String(ann.text || ''), {
                        x: tPt[0],
                        y: tPt[1],
                        size: fSize,
                        font: helveticaFont,
                        color: pdfColor,
                        rotate: textRot
                    });
                } else if (ann.type === 'redact') {
                    var redRect = visualRectToRawPdfRect(baseVp, ann.x, ann.y, ann.w, ann.h);
                    page.drawRectangle({
                        x: redRect.x,
                        y: redRect.y,
                        width: redRect.width,
                        height: redRect.height,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                } else if (ann.type === 'highlight') {
                    var hlRect = visualRectToRawPdfRect(baseVp, ann.x, ann.y, ann.w, ann.h);
                    page.drawRectangle({
                        x: hlRect.x,
                        y: hlRect.y,
                        width: hlRect.width,
                        height: hlRect.height,
                        color: pdfColor,
                        opacity: 0.35
                    });
                } else if (ann.type === 'strikethrough') {
                    var stH = ann.h || 14;
                    var stW = ann.w || 60;
                    var stMidY = ann.y + stH * 0.52;
                    var stStartPt = baseVp.convertToPdfPoint(ann.x, stMidY);
                    var stEndPt = baseVp.convertToPdfPoint(ann.x + stW, stMidY);
                    page.drawLine({
                        start: { x: stStartPt[0], y: stStartPt[1] },
                        end: { x: stEndPt[0], y: stEndPt[1] },
                        thickness: Math.max(1.5, ann.strokeWidth || 2.2),
                        color: pdfColor
                    });
                } else if (ann.type === 'rect') {
                    var rRect = visualRectToRawPdfRect(baseVp, ann.x, ann.y, ann.w, ann.h);
                    page.drawRectangle({
                        x: rRect.x,
                        y: rRect.y,
                        width: rRect.width,
                        height: rRect.height,
                        borderColor: pdfColor,
                        borderWidth: ann.strokeWidth || 3
                    });
                } else if (ann.type === 'stamp') {
                    var sw = ann.w || 150;
                    var sh = ann.h || 38;
                    var stRect = visualRectToRawPdfRect(baseVp, ann.x, ann.y, sw, sh);
                    page.drawRectangle({
                        x: stRect.x,
                        y: stRect.y,
                        width: stRect.width,
                        height: stRect.height,
                        color: PDFLib.rgb(1, 1, 1),
                        borderColor: pdfColor,
                        borderWidth: 2.5,
                        opacity: 0.9
                    });
                    var stPt = baseVp.convertToPdfPoint(ann.x + 10, ann.y + sh - 11);
                    page.drawText(String(ann.text || 'BEZAHLT'), {
                        x: stPt[0],
                        y: stPt[1],
                        size: 16,
                        font: helveticaFont,
                        color: pdfColor,
                        rotate: textRot
                    });
                } else if (ann.type === 'pen' && ann.points && ann.points.length > 1) {
                    for (var ptIdx = 1; ptIdx < ann.points.length; ptIdx++) {
                        var p0 = baseVp.convertToPdfPoint(ann.points[ptIdx - 1].x, ann.points[ptIdx - 1].y);
                        var p1 = baseVp.convertToPdfPoint(ann.points[ptIdx].x, ann.points[ptIdx].y);
                        page.drawLine({
                            start: { x: p0[0], y: p0[1] },
                            end: { x: p1[0], y: p1[1] },
                            thickness: ann.strokeWidth || 3,
                            color: pdfColor
                        });
                    }
                } else if (ann.type === 'image' && ann.dataUrl) {
                    var embeddedImg;
                    if (ann.dataUrl.indexOf('image/png') !== -1) {
                        embeddedImg = await pdfDoc.embedPng(ann.dataUrl);
                    } else {
                        embeddedImg = await pdfDoc.embedJpg(ann.dataUrl);
                    }
                    var imgPt = baseVp.convertToPdfPoint(ann.x, ann.y + ann.h);
                    page.drawImage(embeddedImg, {
                        x: imgPt[0],
                        y: imgPt[1],
                        width: ann.w,
                        height: ann.h,
                        rotate: textRot
                    });
                } else if (ann.type === 'form-text') {
                    var tfName = (ann.fieldName || 'feld') + '_' + uid();
                    var tf = form.createTextField(tfName);
                    if (ann.defaultValue) tf.setText(ann.defaultValue);
                    tf.addToPage(page, {
                        x: ann.x,
                        y: pageH - ann.y - ann.h,
                        width: ann.w,
                        height: ann.h
                    });
                } else if (ann.type === 'form-check') {
                    var cbName = (ann.fieldName || 'check') + '_' + uid();
                    var cb = form.createCheckBox(cbName);
                    if (ann.checked) cb.check();
                    cb.addToPage(page, {
                        x: ann.x,
                        y: pageH - ann.y - ann.h,
                        width: ann.w,
                        height: ann.h
                    });
                } else if (ann.type === 'form-select') {
                    var ddName = (ann.fieldName || 'select') + '_' + uid();
                    var dd = form.createDropdown(ddName);
                    var opts = ann.options && ann.options.length ? ann.options : ['Option A', 'Option B'];
                    dd.addOptions(opts);
                    dd.select(opts[0]);
                    dd.addToPage(page, {
                        x: ann.x,
                        y: pageH - ann.y - ann.h,
                        width: ann.w,
                        height: ann.h
                    });
                } else if (ann.type === 'link') {
                    var rectArr = [ann.x, pageH - ann.y - ann.h, ann.x + ann.w, pageH - ann.y];
                    var linkAnnotObj = {
                        Type: 'Annot',
                        Subtype: 'Link',
                        Rect: rectArr,
                        Border: [0, 0, 0]
                    };
                    var pageNumTarget = parseInt(ann.target, 10);
                    if (!isNaN(pageNumTarget) && pageNumTarget >= 1 && pageNumTarget <= pages.length) {
                        linkAnnotObj.Dest = [pages[pageNumTarget - 1].ref, PDFLib.PDFName.of('Fit')];
                    } else {
                        linkAnnotObj.A = context.obj({
                            Type: 'Action',
                            S: 'URI',
                            URI: PDFLib.PDFString.of(ann.target || 'https://example.org')
                        });
                    }
                    var annotRef = context.register(context.obj(linkAnnotObj));
                    var annotsArr = page.node.lookup(PDFLib.PDFName.of('Annots'));
                    if (annotsArr && annotsArr.push) {
                        annotsArr.push(annotRef);
                    } else {
                        page.node.set(PDFLib.PDFName.of('Annots'), context.obj([annotRef]));
                    }
                } else if (ann.type === 'a11y-tag') {
                    customTagElements.push({
                        pageIndex: i,
                        pageRef: page.ref,
                        tagType: ann.tagType || 'P',
                        altText: ann.altText || '',
                        order: ann.order || 1,
                        bbox: [
                            Math.round(ann.x),
                            Math.round(pageH - ann.y - ann.h),
                            Math.round(ann.x + ann.w),
                            Math.round(pageH - ann.y)
                        ]
                    });
                }
            }
        }

        // Persist custom a11y-tags on doc so 1-Click PDF/UA Remediation also preserves them with /Alt and /BBox
        if (customTagElements.length > 0) {
            doc.savedA11yTags = (doc.savedA11yTags || []).concat(customTagElements);
        }

        // If visual PDF/UA Tags (/StructElem + /Alt + /BBox) were placed, embed them into /StructTreeRoot
        if (customTagElements.length > 0) {
            customTagElements.sort(function (a, b) { return a.order - b.order; });
            var catalog = pdfDoc.catalog;
            var structRootRef = context.nextRef();
            var docElemRef = context.nextRef();
            var kidsRefs = [];

            for (var t = 0; t < customTagElements.length; t++) {
                var item = customTagElements[t];
                var elemDict = {
                    Type: 'StructElem',
                    S: PDFLib.PDFName.of(item.tagType),
                    P: docElemRef,
                    Pg: item.pageRef,
                    A: context.obj({
                        O: PDFLib.PDFName.of('Layout'),
                        BBox: item.bbox
                    })
                };
                if (item.altText || item.tagType === 'Figure') {
                    var figAlt = item.altText || ('Abbildung auf Seite ' + ((item.pageIndex || 0) + 1));
                    elemDict.Alt = PDFLib.PDFString.of(figAlt);
                    elemDict.ActualText = PDFLib.PDFString.of(figAlt);
                }
                kidsRefs.push(context.register(context.obj(elemDict)));
            }

            context.assign(docElemRef, context.obj({
                Type: 'StructElem',
                S: PDFLib.PDFName.of('Document'),
                P: structRootRef,
                K: kidsRefs
            }));
            context.assign(structRootRef, context.obj({
                Type: 'StructTreeRoot',
                K: [docElemRef]
            }));
            catalog.set(PDFLib.PDFName.of('StructTreeRoot'), structRootRef);
            catalog.set(PDFLib.PDFName.of('MarkInfo'), context.obj({ Marked: true }));
        }

        doc.bytes = await pdfDoc.save();
        doc.annotations = {};
    }

    // =========================================================================
    // Page Manipulation Operations (Rotate, Reorder, Delete, Duplicate, Blank, Merge, Split)
    // =========================================================================
    async function rotatePageAt(pageIndex, deltaDegrees) {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var page = pdfDoc.getPage(pageIndex);
        var currentAngle = page.getRotation().angle || 0;
        var nextAngle = (currentAngle + deltaDegrees + 360) % 360;
        page.setRotation(PDFLib.degrees(nextAngle));
        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Seite ' + (pageIndex + 1) + ' gedreht (' + nextAngle + '°)');
    }

    async function rotateAllPages(deltaDegrees) {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var pages = pdfDoc.getPages();
        for (var i = 0; i < pages.length; i++) {
            var cur = pages[i].getRotation().angle || 0;
            pages[i].setRotation(PDFLib.degrees((cur + deltaDegrees + 360) % 360));
        }
        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Alle Seiten gedreht');
    }

    async function reorderPage(fromIndex, toIndex) {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var srcDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var newDoc = await PDFLib.PDFDocument.create();
        var total = srcDoc.getPageCount();
        var order = [];
        for (var i = 0; i < total; i++) order.push(i);
        var moved = order.splice(fromIndex, 1)[0];
        order.splice(toIndex, 0, moved);

        var copiedPages = await newDoc.copyPages(srcDoc, order);
        for (var j = 0; j < copiedPages.length; j++) {
            newDoc.addPage(copiedPages[j]);
        }
        doc.bytes = await newDoc.save();
        doc.currentPage = toIndex;
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Seite ' + (fromIndex + 1) + ' → Position ' + (toIndex + 1) + ' verschoben');
    }

    async function reversePageOrder() {
        var doc = getActiveDoc();
        if (!doc || doc.pageCount < 2) return;
        await bakeAnnotationsIntoDocument(doc);
        var srcDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var newDoc = await PDFLib.PDFDocument.create();
        var indices = [];
        for (var i = srcDoc.getPageCount() - 1; i >= 0; i--) {
            indices.push(i);
        }
        var copied = await newDoc.copyPages(srcDoc, indices);
        copied.forEach(function (p) { newDoc.addPage(p); });
        doc.bytes = await newDoc.save();
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Seitenreihenfolge umgekehrt');
    }

    async function deletePageAt(pageIndex) {
        var doc = getActiveDoc();
        if (!doc) return;
        if (doc.pageCount <= 1) {
            showToast('Das Dokument muss mindestens eine Seite enthalten.', 'error');
            return;
        }
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        pdfDoc.removePage(pageIndex);
        doc.bytes = await pdfDoc.save();
        doc.pageCount = pdfDoc.getPageCount();
        if (doc.currentPage >= doc.pageCount) {
            doc.currentPage = doc.pageCount - 1;
        }
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Seite ' + (pageIndex + 1) + ' gelöscht');
    }

    async function duplicateCurrentPage() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var copied = await pdfDoc.copyPages(pdfDoc, [doc.currentPage]);
        pdfDoc.insertPage(doc.currentPage + 1, copied[0]);
        doc.bytes = await pdfDoc.save();
        doc.pageCount = pdfDoc.getPageCount();
        doc.currentPage += 1;
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Seite dupliziert');
    }

    async function insertBlankPage() {
        var doc = getActiveDoc();
        if (!doc) {
            await createNewBlankPdfTab();
            return;
        }
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var insertIdx = doc.currentPage + 1;
        pdfDoc.insertPage(insertIdx, [595.28, 841.89]); // DIN A4
        doc.bytes = await pdfDoc.save();
        doc.pageCount = pdfDoc.getPageCount();
        doc.currentPage = insertIdx;
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Leere DIN-A4 Seite eingefügt');
    }

    async function createNewBlankPdfTab() {
        var pdfDoc = await PDFLib.PDFDocument.create();
        pdfDoc.addPage([595.28, 841.89]);
        var bytes = await pdfDoc.save();
        await addDocumentTab('Neues_Dokument.pdf', bytes, 'editor');
        showToast('Neues leeres PDF erstellt', 'success');
    }

    state.mergeQueue = [];

    function renderMergeQueueUI() {
        var listEl = document.getElementById('mergeQueueList');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (!state.mergeQueue || state.mergeQueue.length === 0) {
            listEl.innerHTML =
                '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:22px 10px;line-height:1.5;">' +
                'Noch keine PDF-Dateien in der Zusammenführungs-Liste.<br>' +
                'Klicken Sie oben auf <strong>„📂 PDF-Dateien hinzufügen…“</strong> oder <strong>„⇄ Geöffnete Tabs übernehmen“</strong>.' +
                '</div>';
            return;
        }

        state.mergeQueue.forEach(function (item, idx) {
            var row = document.createElement('div');
            row.style.cssText =
                'display:flex;align-items:center;justify-content:space-between;gap:10px;' +
                'background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;padding:7px 10px;';
            row.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">' +
                '  <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:var(--accent-soft);color:var(--accent-primary);font-weight:700;font-size:11px;flex-shrink:0;">' + (idx + 1) + '</span>' +
                '  <div style="min-width:0;flex:1;">' +
                '    <div style="font-weight:600;font-size:12.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📄 ' + escapeHtml(item.name) + '</div>' +
                '    <div style="font-size:11px;color:var(--text-secondary);">' + item.pageCount + ' Seite(n) • ' + escapeHtml(item.sourceLabel || 'Lokale Datei') + '</div>' +
                '  </div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' +
                '  <button type="button" class="thumb-icon-btn" data-merge-up="' + idx + '" title="Nach oben verschieben"' + (idx === 0 ? ' disabled style="opacity:0.35;cursor:default;"' : '') + '>▲</button>' +
                '  <button type="button" class="thumb-icon-btn" data-merge-down="' + idx + '" title="Nach unten verschieben"' + (idx === state.mergeQueue.length - 1 ? ' disabled style="opacity:0.35;cursor:default;"' : '') + '>▼</button>' +
                '  <button type="button" class="thumb-icon-btn" data-merge-del="' + idx + '" title="Aus Liste entfernen" style="color:var(--accent-danger);">🗑</button>' +
                '</div>';

            var upBtn = row.querySelector('[data-merge-up]');
            if (upBtn && idx > 0) {
                upBtn.addEventListener('click', function () {
                    var tmp = state.mergeQueue[idx - 1];
                    state.mergeQueue[idx - 1] = state.mergeQueue[idx];
                    state.mergeQueue[idx] = tmp;
                    renderMergeQueueUI();
                });
            }

            var downBtn = row.querySelector('[data-merge-down]');
            if (downBtn && idx < state.mergeQueue.length - 1) {
                downBtn.addEventListener('click', function () {
                    var tmp = state.mergeQueue[idx + 1];
                    state.mergeQueue[idx + 1] = state.mergeQueue[idx];
                    state.mergeQueue[idx] = tmp;
                    renderMergeQueueUI();
                });
            }

            var delBtn = row.querySelector('[data-merge-del]');
            if (delBtn) {
                delBtn.addEventListener('click', function () {
                    state.mergeQueue.splice(idx, 1);
                    renderMergeQueueUI();
                });
            }

            listEl.appendChild(row);
        });
    }

    async function addOpenTabsToMergeQueue(silent) {
        if (!state.tabs || state.tabs.length === 0) {
            if (!silent) showToast('Aktuell sind keine PDF-Tabs im Studio geöffnet.', 'info');
            return;
        }
        var added = 0;
        for (var i = 0; i < state.tabs.length; i++) {
            var t = state.tabs[i];
            await bakeAnnotationsIntoDocument(t);
            state.mergeQueue.push({
                id: uid(),
                name: t.name,
                bytes: new Uint8Array(t.bytes),
                pageCount: t.pageCount || 1,
                sourceLabel: 'Geöffneter Tab'
            });
            added++;
        }
        renderMergeQueueUI();
        if (!silent && added > 0) {
            showToast(added + ' geöffnete(r) Tab(s) zur Liste hinzugefügt', 'success');
        }
    }

    async function openMergeModalUI() {
        if (!state.mergeQueue) state.mergeQueue = [];
        if (state.mergeQueue.length === 0 && state.tabs && state.tabs.length > 0) {
            await addOpenTabsToMergeQueue(true);
        } else {
            renderMergeQueueUI();
        }
        openModal('modalMerge');
    }

    async function addFilesToMergeQueue(fileList) {
        if (!fileList || fileList.length === 0) return;
        if (!state.mergeQueue) state.mergeQueue = [];
        var addedCount = 0;
        for (var i = 0; i < fileList.length; i++) {
            var file = fileList[i];
            try {
                var buf = await file.arrayBuffer();
                var bytes = new Uint8Array(buf);
                var pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
                state.mergeQueue.push({
                    id: uid(),
                    name: file.name,
                    bytes: bytes,
                    pageCount: pdfDoc.getPageCount(),
                    sourceLabel: 'Computer-Datei'
                });
                addedCount++;
            } catch (err) {
                showToast('Datei „' + file.name + '“ konnte nicht als PDF gelesen werden.', 'error');
            }
        }
        renderMergeQueueUI();
        var modalEl = document.getElementById('modalMerge');
        if (modalEl && !modalEl.classList.contains('open')) {
            openModal('modalMerge');
        }
        if (addedCount > 0) {
            showToast(addedCount + ' PDF-Datei(en) zur Zusammenführungs-Liste hinzugefügt', 'success');
        }
    }

    async function executeMergeQueue(downloadDirectly) {
        if (!state.mergeQueue || state.mergeQueue.length === 0) {
            showToast('Bitte fügen Sie zuerst mindestens eine PDF-Datei zur Liste hinzu.', 'error');
            document.getElementById('hiddenMergeInput').click();
            return;
        }

        var targetModeEl = document.getElementById('mergeTargetMode');
        var targetMode = targetModeEl ? targetModeEl.value : 'new-tab';
        var outNameEl = document.getElementById('mergeOutputName');
        var outName = (outNameEl && outNameEl.value.trim()) ? outNameEl.value.trim() : 'Zusammengefuegt.pdf';
        if (!/\.pdf$/i.test(outName)) outName += '.pdf';

        var activeDoc = getActiveDoc();
        var targetPdf;

        setProgress(20, 'Führe ' + state.mergeQueue.length + ' PDF-Dokument(e) zusammen…');

        if (targetMode === 'append-active' && activeDoc && !downloadDirectly) {
            await bakeAnnotationsIntoDocument(activeDoc);
            targetPdf = await PDFLib.PDFDocument.load(activeDoc.bytes, { ignoreEncryption: true });
        } else {
            targetPdf = await PDFLib.PDFDocument.create();
        }

        for (var i = 0; i < state.mergeQueue.length; i++) {
            var item = state.mergeQueue[i];
            var srcPdf = await PDFLib.PDFDocument.load(item.bytes, { ignoreEncryption: true });
            var copied = await targetPdf.copyPages(srcPdf, srcPdf.getPageIndices());
            copied.forEach(function (p) { targetPdf.addPage(p); });
        }

        var mergedBytes = await targetPdf.save();
        var totalPages = targetPdf.getPageCount();
        setProgress(null);
        closeModal('modalMerge');
        trackUsageEvent('pdf_merged');

        if (downloadDirectly) {
            downloadBlob(mergedBytes, outName, 'application/pdf');
            showToast('Zusammengeführtes PDF (' + totalPages + ' Seiten) heruntergeladen!', 'success');
            return;
        }

        if (targetMode === 'append-active' && activeDoc) {
            activeDoc.bytes = mergedBytes;
            activeDoc.pageCount = totalPages;
            activeDoc.modified = true;
            await refreshDocumentViews();
            showToast('PDFs an „' + activeDoc.name + '“ angehängt (jetzt ' + totalPages + ' Seiten)!', 'success');
        } else {
            await addDocumentTab(outName, mergedBytes, 'organizer');
            showToast('PDFs erfolgreich zu „' + outName + '“ (' + totalPages + ' Seiten) zusammengeführt!', 'success');
        }
        state.mergeQueue = [];
    }

    async function mergeUploadedPdfFiles(fileList) {
        await addFilesToMergeQueue(fileList);
    }

    async function mergeAllOpenTabs() {
        if (state.tabs.length < 2) {
            showToast('Öffnen Sie mindestens 2 PDF-Tabs, um alle Tabs zu verbinden.', 'error');
            return;
        }
        var mergedPdf = await PDFLib.PDFDocument.create();
        for (var i = 0; i < state.tabs.length; i++) {
            var tab = state.tabs[i];
            await bakeAnnotationsIntoDocument(tab);
            var src = await PDFLib.PDFDocument.load(tab.bytes, { ignoreEncryption: true });
            var copied = await mergedPdf.copyPages(src, src.getPageIndices());
            copied.forEach(function (p) { mergedPdf.addPage(p); });
        }
        var outBytes = await mergedPdf.save();
        await addDocumentTab('Alle_Tabs_Verbunden.pdf', outBytes, 'organizer');
        trackUsageEvent('pdf_merged');
        showToast('Alle geöffneten Tabs zu einem PDF verbunden!', 'success');
    }

    async function refreshDocumentViews() {
        renderTabsBar();
        await renderSidebarThumbnails();
        if (state.viewMode === 'organizer') {
            await renderOrganizerGrid();
        } else if (state.viewMode === 'editor') {
            await renderCurrentEditorPage();
        }
        updateStatusBarInfo();
    }

    // =========================================================================
    // Sammelmappe (Page Collector Tray)
    // =========================================================================
    async function addPageToTray(pageIndex) {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var srcPdf = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var singlePdf = await PDFLib.PDFDocument.create();
        var copied = await singlePdf.copyPages(srcPdf, [pageIndex]);
        singlePdf.addPage(copied[0]);
        var singleBytes = await singlePdf.save();

        state.tray.push({
            id: uid(),
            sourceName: doc.name,
            pageNumber: pageIndex + 1,
            bytes: singleBytes
        });
        renderTrayList();
        showToast('Seite ' + (pageIndex + 1) + ' zur Sammelmappe hinzugefügt');
    }

    function renderTrayList() {
        el.trayBadge.textContent = String(state.tray.length);
        el.trayList.innerHTML = '';
        state.tray.forEach(function (item, idx) {
            var div = document.createElement('div');
            div.className = 'thumb-item';
            div.innerHTML =
                '<div class="thumb-footer" style="margin-top:0;">' +
                '  <span><b>#' + (idx + 1) + '</b> ' + escapeHtml(item.sourceName) + ' (S. ' + item.pageNumber + ')</span>' +
                '  <button type="button" class="thumb-icon-btn" title="Aus Sammelmappe entfernen">✕</button>' +
                '</div>';
            div.querySelector('button').addEventListener('click', function () {
                state.tray.splice(idx, 1);
                renderTrayList();
            });
            el.trayList.appendChild(div);
        });
    }

    async function buildPdfFromTray() {
        if (state.tray.length === 0) {
            showToast('Die Sammelmappe ist noch leer. Fügen Sie erst Seiten über "+" hinzu.', 'error');
            return;
        }
        var outPdf = await PDFLib.PDFDocument.create();
        for (var i = 0; i < state.tray.length; i++) {
            var src = await PDFLib.PDFDocument.load(state.tray[i].bytes);
            var copied = await outPdf.copyPages(src, [0]);
            outPdf.addPage(copied[0]);
        }
        var bytes = await outPdf.save();
        await addDocumentTab('Sammelmappe_' + state.tray.length + '_Seiten.pdf', bytes, 'editor');
        showToast('Neues PDF aus Sammelmappe erstellt!', 'success');
    }

    // =========================================================================
    // Power Tools: Watermark, Page Numbers, Metadata, Compression, OCR, Split
    // =========================================================================
    async function applyWatermarkToAllPages() {
        var doc = getActiveDoc();
        if (!doc) return;
        revealRightDockSection('inspectorWatermarkSection', 'wmText');
        var text = document.getElementById('wmText').value.trim() || 'VERTRAULICH';
        var opacity = parseFloat(document.getElementById('wmOpacity').value) || 0.22;
        var size = parseInt(document.getElementById('wmSize').value, 10) || 48;

        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        var pages = pdfDoc.getPages();

        for (var i = 0; i < pages.length; i++) {
            var p = pages[i];
            var dim = p.getSize();
            p.drawText(text, {
                x: dim.width * 0.18,
                y: dim.height * 0.35,
                size: size,
                font: font,
                color: PDFLib.rgb(0.75, 0.15, 0.18),
                opacity: opacity,
                rotate: PDFLib.degrees(38)
            });
        }

        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Wasserzeichen "' + text + '" auf alle Seiten angewendet', 'success');
    }

    async function applyPageNumbersToAllPages() {
        var doc = getActiveDoc();
        if (!doc) return;
        revealRightDockSection('inspectorWatermarkSection', 'pageNumPos');
        var pos = document.getElementById('pageNumPos').value;

        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        var pages = pdfDoc.getPages();
        var total = pages.length;

        for (var i = 0; i < total; i++) {
            var p = pages[i];
            var dim = p.getSize();
            var label = 'Seite ' + (i + 1) + ' von ' + total;
            var textWidth = font.widthOfTextAtSize(label, 10);
            var x = dim.width - textWidth - 36;
            var y = 24;

            if (pos === 'bottom-center') {
                x = (dim.width - textWidth) / 2;
            } else if (pos === 'bottom-left') {
                x = 36;
            } else if (pos === 'top-right') {
                y = dim.height - 28;
            }

            p.drawText(label, {
                x: x,
                y: y,
                size: 10,
                font: font,
                color: PDFLib.rgb(0.3, 0.35, 0.42)
            });
        }

        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Seitenzahlen auf ' + total + ' Seiten eingefügt', 'success');
    }

    async function openCompressModalUI() {
        var doc = getActiveDoc();
        if (!doc) {
            await createNewBlankPdfTab();
            doc = getActiveDoc();
        }
        if (!doc) return;

        var nameEl = document.getElementById('modalCompressDocName');
        var infoEl = document.getElementById('modalCompressDocInfo');
        var resBox = document.getElementById('modalCompressResultBox');
        var dlBtn = document.getElementById('btnModalDownloadCompressed');

        if (nameEl) nameEl.textContent = '📄 ' + doc.name;
        if (infoEl) infoEl.textContent = 'Aktuelle Dateigröße: ' + formatBytes(doc.bytes.byteLength) + ' • ' + doc.pageCount + ' Seite(n)';
        if (resBox) resBox.classList.add('hidden');
        if (dlBtn) dlBtn.classList.add('hidden');

        // Sync metadata inputs
        var mTitle = document.getElementById('modalMetaTitle');
        var mAuthor = document.getElementById('modalMetaAuthor');
        var mSub = document.getElementById('modalMetaSubject');
        var meta = doc.meta || {};
        if (mTitle) mTitle.value = meta.title || document.getElementById('metaTitle').value || doc.name.replace(/\.pdf$/i, '');
        if (mAuthor) mAuthor.value = meta.author || document.getElementById('metaAuthor').value || (state.user ? (state.user.display_name || state.user.username) : '');
        if (mSub) mSub.value = meta.subject || document.getElementById('metaSubject').value || '';

        openModal('modalCompress');
    }

    async function applyMetadataToDocument(fromModal) {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });

        var title = (fromModal ? document.getElementById('modalMetaTitle').value : document.getElementById('metaTitle').value).trim();
        var author = (fromModal ? document.getElementById('modalMetaAuthor').value : document.getElementById('metaAuthor').value).trim();
        var subject = (fromModal ? document.getElementById('modalMetaSubject').value : document.getElementById('metaSubject').value).trim();

        // Keep both sidebar and modal inputs in sync
        document.getElementById('metaTitle').value = title;
        document.getElementById('metaAuthor').value = author;
        document.getElementById('metaSubject').value = subject;
        var mTitle = document.getElementById('modalMetaTitle');
        var mAuthor = document.getElementById('modalMetaAuthor');
        var mSub = document.getElementById('modalMetaSubject');
        if (mTitle) mTitle.value = title;
        if (mAuthor) mAuthor.value = author;
        if (mSub) mSub.value = subject;

        pdfDoc.setTitle(title);
        pdfDoc.setAuthor(author);
        pdfDoc.setSubject(subject);
        pdfDoc.setProducer('PDF-Werkstatt Pro v' + (window.PDFSTUDIO_VERSION || '1.1.0') + ' Desktop Suite');

        doc.meta = { title: title, author: author, subject: subject };
        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        updateStatusBarInfo();
        showToast('PDF-Metadaten erfolgreich in das Dokument geschrieben!', 'success');
    }

    async function runPdfCompression(presetOverride) {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);

        var preset = presetOverride || document.getElementById('compressPreset').value;
        document.getElementById('compressPreset').value = preset;
        var modalPresetEl = document.getElementById('modalCompressPreset');
        if (modalPresetEl) modalPresetEl.value = preset;

        var scale = preset === 'screen' ? 1.0 : (preset === 'ebook' ? 1.45 : 2.0);
        var jpegQuality = preset === 'screen' ? 0.52 : (preset === 'ebook' ? 0.72 : 0.86);

        var originalSize = doc.bytes.byteLength;
        setProgress(5, 'Komprimiere PDF…');

        try {
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            var outPdf = await PDFLib.PDFDocument.create();

            for (var p = 1; p <= pdfJsDoc.numPages; p++) {
                setProgress((p / pdfJsDoc.numPages) * 90, 'Komprimiere Seite ' + p + '/' + pdfJsDoc.numPages);
                var page = await pdfJsDoc.getPage(p);
                var baseVp = page.getViewport({ scale: 1.0 });
                var renderVp = page.getViewport({ scale: scale });

                var offCanvas = document.createElement('canvas');
                offCanvas.width = renderVp.width;
                offCanvas.height = renderVp.height;
                var ctx = offCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

                await page.render({ canvasContext: ctx, viewport: renderVp }).promise;
                var jpgDataUrl = offCanvas.toDataURL('image/jpeg', jpegQuality);
                var embeddedJpg = await outPdf.embedJpg(jpgDataUrl);

                var newPage = outPdf.addPage([baseVp.width, baseVp.height]);
                newPage.drawImage(embeddedJpg, {
                    x: 0,
                    y: 0,
                    width: baseVp.width,
                    height: baseVp.height
                });
            }

            var compressedBytes = await outPdf.save();
            setProgress(null);

            doc.bytes = compressedBytes;
            doc.modified = true;
            await refreshDocumentViews();

            var newSize = compressedBytes.byteLength;
            var diffPct = originalSize > 0 ? Math.round((1 - (newSize / originalSize)) * 100) : 0;
            var pctLabel = diffPct > 0 ? (' (−' + diffPct + ' %)') : '';
            var summaryStr = '✔ Vorher: ' + formatBytes(originalSize) + ' → Nachher: ' + formatBytes(newSize) + pctLabel;

            var infoEl = document.getElementById('compressResultInfo');
            if (infoEl) infoEl.textContent = summaryStr;

            var modalInfoEl = document.getElementById('modalCompressDocInfo');
            if (modalInfoEl) {
                modalInfoEl.textContent = 'Aktuelle Dateigröße: ' + formatBytes(newSize) + ' • ' + doc.pageCount + ' Seite(n)';
            }
            var modalResBox = document.getElementById('modalCompressResultBox');
            if (modalResBox) {
                modalResBox.textContent = summaryStr;
                modalResBox.classList.remove('hidden');
            }
            var dlBtn = document.getElementById('btnModalDownloadCompressed');
            if (dlBtn) dlBtn.classList.remove('hidden');

            trackUsageEvent('pdf_compressed');
            showToast('PDF komprimiert (' + formatBytes(originalSize) + ' → ' + formatBytes(newSize) + pctLabel + ')', 'success');
        } catch (err) {
            setProgress(null);
            showToast('Fehler bei der Komprimierung: ' + err.message, 'error');
        }
    }

    function getAppBaseDirUrl() {
        var href = String(window.location.href || '').split('#')[0].split('?')[0];
        if (!/\/$/.test(href)) {
            href = href.replace(/\/[^\/]*$/, '/');
        }
        return href;
    }

    function revealRightDockSection(sectionId, focusInputId) {
        var rd = document.getElementById('rightDock');
        if (rd && rd.classList.contains('collapsed')) {
            rd.classList.remove('collapsed');
        }
        if (sectionId) {
            var sec = document.getElementById(sectionId);
            if (sec && sec.scrollIntoView) {
                setTimeout(function () {
                    sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    if (focusInputId) {
                        var inp = document.getElementById(focusInputId);
                        if (inp && inp.focus) inp.focus();
                    }
                }, 40);
            }
        }
    }

    function setOcrStatusBox(msg, type) {
        var box = document.getElementById('ocrStatusBox');
        if (!box) return;
        if (!msg) {
            box.classList.add('hidden');
            box.innerHTML = '';
            return;
        }
        revealRightDockSection('inspectorOcrSection');
        box.classList.remove('hidden');
        if (type === 'success') {
            box.style.background = 'rgba(16, 185, 129, 0.14)';
            box.style.borderColor = 'rgba(16, 185, 129, 0.45)';
            box.style.color = '#34d399';
        } else if (type === 'error') {
            box.style.background = 'rgba(239, 68, 68, 0.14)';
            box.style.borderColor = 'rgba(239, 68, 68, 0.45)';
            box.style.color = '#f87171';
        } else {
            box.style.background = 'rgba(59, 130, 246, 0.12)';
            box.style.borderColor = 'rgba(59, 130, 246, 0.38)';
            box.style.color = 'var(--text-primary)';
        }
        box.innerHTML = msg;
    }

    function scrollOcrSectionIntoView() {
        revealRightDockSection('inspectorOcrSection');
    }

    async function createOfflineTesseractWorker(lang, labelPrefix) {
        var baseDir = getAppBaseDirUrl();
        var workerUrl = baseDir + 'assets/vendor/tesseract/worker.min.js';
        var coreUrl = baseDir + 'assets/vendor/tesseract/tesseract-core-lstm.wasm.js';
        var langUrl = baseDir + 'assets/vendor/tesseract/lang';

        return await window.Tesseract.createWorker(lang, 1, {
            workerPath: workerUrl,
            corePath: coreUrl,
            langPath: langUrl,
            workerBlobURL: false,
            gzip: false,
            cacheMethod: 'none',
            logger: function (m) {
                if (!m || !m.status) return;
                if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                    var pct = Math.max(5, Math.round(m.progress * 100));
                    setProgress(pct, labelPrefix + ' ' + pct + ' %');
                    setOcrStatusBox('⏳ <strong>' + escapeHtml(labelPrefix) + ':</strong> Texterkennung läuft (' + pct + ' %)…', 'info');
                } else if (m.status.indexOf('loading') !== -1 || m.status.indexOf('initializing') !== -1) {
                    setOcrStatusBox('⏳ <strong>' + escapeHtml(labelPrefix) + ':</strong> Initialisiere lokale OCR-Engine (' + escapeHtml(lang) + ')…', 'info');
                }
            },
            errorHandler: function (err) {
                console.error('Tesseract Worker Error:', err);
            }
        });
    }

    async function extractEmbeddedPageText(allPages) {
        var doc = getActiveDoc();
        if (!doc) return '';
        scrollOcrSectionIntoView();
        try {
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            var out = [];
            var totalWords = 0;
            var start = allPages ? 1 : (doc.currentPage + 1);
            var end = allPages ? pdfJsDoc.numPages : (doc.currentPage + 1);

            for (var p = start; p <= end; p++) {
                var page = await pdfJsDoc.getPage(p);
                var baseVp = page.getViewport({ scale: 1.0 });
                var blocks = await extractPageTextBlocks(page, baseVp);
                var linesText = blocks.map(function (b) { return b.text; });
                totalWords += linesText.join(' ').trim() ? linesText.join(' ').trim().split(/\s+/).length : 0;
                out.push('--- Seite ' + p + ' ---\n' + (linesText.length ? linesText.join('\n') : '(Kein eingebetteter Text auf dieser Seite vorhanden — reiner Bild-Scan)'));
            }
            var result = out.join('\n\n');
            var outEl = document.getElementById('ocrOutputText');
            if (outEl) outEl.value = result;

            if (totalWords > 0) {
                setOcrStatusBox('✔ <strong>Durchsuchbarer PDF-Text vorhanden:</strong> ' + totalWords + ' Wörter ausgelesen. Sie können unten mit <code>Strg+F</code> suchen oder <code>I✎ Text ändern</code> nutzen.', 'success');
                showToast('Eingebetteter PDF-Text ausgelesen (' + totalWords + ' Wörter)', 'success');
            } else {
                setOcrStatusBox('ℹ️ <strong>Reiner Bild-Scan erkannt:</strong> Diese Seite enthält noch keine Textebene. Klicken Sie oben auf <strong>„🔎 In durchsuchbares PDF umwandeln“</strong>!', 'info');
                showToast('Kein eingebetteter Text gefunden (Scan). Nutzen Sie „🔎 In durchsuchbares PDF umwandeln“.');
            }
            return result;
        } catch (err) {
            showToast('Fehler beim Auslesen: ' + err.message, 'error');
            return '';
        }
    }

    // =========================================================================
    // Offline Browser Text-to-Speech (Vorlese-Funktion & Live-Zeilenmarkierung)
    // =========================================================================
    function initTtsVoices() {
        if (!('speechSynthesis' in window)) return;
        var selectEl = document.getElementById('ttsVoiceSelect');
        if (!selectEl) return;

        function populateVoices() {
            var voices = window.speechSynthesis.getVoices() || [];
            if (!voices.length) return;
            var prevVal = selectEl.value;
            selectEl.innerHTML = '<option value="">Standard (Deutsch / System)</option>';

            // Sort German voices first, then English, then others
            var sorted = voices.slice().sort(function (a, b) {
                var aDe = /^de/i.test(a.lang || '') ? 0 : (/^en/i.test(a.lang || '') ? 1 : 2);
                var bDe = /^de/i.test(b.lang || '') ? 0 : (/^en/i.test(b.lang || '') ? 1 : 2);
                if (aDe !== bDe) return aDe - bDe;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });

            var preferredUri = '';
            for (var i = 0; i < sorted.length; i++) {
                var v = sorted[i];
                if (!/^de|^en/i.test(v.lang || '') && sorted.length > 12) continue;
                var opt = document.createElement('option');
                opt.value = v.voiceURI || v.name;
                opt.textContent = v.name + ' (' + v.lang + ')';
                selectEl.appendChild(opt);
                if (!preferredUri && /^de/i.test(v.lang || '')) {
                    preferredUri = opt.value;
                }
            }
            if (prevVal) {
                selectEl.value = prevVal;
            } else if (preferredUri) {
                selectEl.value = preferredUri;
            }
        }

        populateVoices();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = populateVoices;
        }
    }

    function getSelectedTtsVoice() {
        if (!('speechSynthesis' in window)) return null;
        var voices = window.speechSynthesis.getVoices() || [];
        var selectEl = document.getElementById('ttsVoiceSelect');
        var chosen = selectEl ? selectEl.value : '';
        if (chosen) {
            for (var i = 0; i < voices.length; i++) {
                if ((voices[i].voiceURI || voices[i].name) === chosen) {
                    return voices[i];
                }
            }
        }
        // Fallback: best German voice
        for (var j = 0; j < voices.length; j++) {
            if (/^de[-_]?DE/i.test(voices[j].lang || '')) return voices[j];
        }
        for (var k = 0; k < voices.length; k++) {
            if (/^de/i.test(voices[k].lang || '')) return voices[k];
        }
        return null;
    }

    function updateTtsUiState(statusLabel, badgeTone) {
        var badge = document.getElementById('ttsStatusBadge');
        if (badge) {
            badge.textContent = statusLabel || (state.ttsSpeaking ? (state.ttsPaused ? 'Pausiert' : 'Liest vor…') : 'Bereit');
            if (badgeTone === 'active' || (state.ttsSpeaking && !state.ttsPaused)) {
                badge.style.background = 'rgba(16, 185, 129, 0.22)';
                badge.style.color = '#34d399';
            } else if (badgeTone === 'paused' || state.ttsPaused) {
                badge.style.background = 'rgba(245, 158, 11, 0.22)';
                badge.style.color = '#fbbf24';
            } else {
                badge.style.background = 'rgba(16, 185, 129, 0.14)';
                badge.style.color = '#10b981';
            }
        }
        var pauseBtn = document.getElementById('btnTtsPause');
        if (pauseBtn) {
            pauseBtn.textContent = state.ttsPaused ? '▶️ Weiter' : '⏸️ Pause';
        }
        var toggleBtns = document.querySelectorAll('[data-cmd="tts-toggle-read"]');
        for (var i = 0; i < toggleBtns.length; i++) {
            var lbl = toggleBtns[i].querySelector('.rb-label');
            var ico = toggleBtns[i].querySelector('.rb-icon');
            if (state.ttsSpeaking) {
                toggleBtns[i].classList.add('active');
                if (ico) ico.textContent = '⏹️';
                if (lbl) lbl.textContent = 'Stopp';
            } else {
                toggleBtns[i].classList.remove('active');
                if (ico) ico.textContent = '🔊';
                if (lbl) lbl.textContent = toggleBtns[i].closest('[data-ribbon-pane="a11y"]') ? 'Vorlesen-Test' : 'Vorlesen';
            }
        }
    }

    function stopTtsReading(silent) {
        state.ttsSessionId++;
        if ('speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch (e) {}
        }
        var wasSpeaking = state.ttsSpeaking;
        state.ttsSpeaking = false;
        state.ttsPaused = false;
        state.ttsActiveBlockIndex = -1;
        updateTtsUiState('Bereit', 'idle');
        redrawAnnotationOverlay();
        if (wasSpeaking && !silent) {
            setStatus('Vorlesen beendet.');
        }
    }

    function pauseOrResumeTts() {
        if (!('speechSynthesis' in window)) {
            showToast('Ihr Browser unterstützt leider keine Sprachausgabe (Web Speech API).', 'error');
            return;
        }
        if (!state.ttsSpeaking) {
            startTtsReadingPage();
            return;
        }
        if (state.ttsPaused) {
            window.speechSynthesis.resume();
            state.ttsPaused = false;
            updateTtsUiState('Liest vor…', 'active');
            showToast('Vorlesen fortgesetzt');
        } else {
            window.speechSynthesis.pause();
            state.ttsPaused = true;
            updateTtsUiState('Pausiert', 'paused');
            showToast('Vorlesen pausiert');
        }
    }

    async function toggleTtsReading() {
        if (state.ttsSpeaking) {
            stopTtsReading(false);
        } else {
            await startTtsReadingPage();
        }
    }

    async function startTtsReadingPage() {
        if (!('speechSynthesis' in window)) {
            showToast('Ihr Browser unterstützt leider keine lokale Sprachausgabe (speechSynthesis).', 'error');
            return;
        }
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }
        if (state.viewMode !== 'editor') {
            await switchView('editor');
        }
        revealRightDockSection('inspectorOcrSection');
        initTtsVoices();

        var blocks = state.currentPageTextBlocks || [];
        if (blocks.length > 0) {
            startTtsReadingFromBlock(0);
            return;
        }

        // Fallback: if #ocrOutputText already contains text (e.g. after OCR scan), read that text
        var outEl = document.getElementById('ocrOutputText');
        var rawTxt = outEl ? String(outEl.value || '').replace(/^---\s*Seite\s+\d+\s*---\s*/gm, '').trim() : '';
        if (rawTxt && rawTxt.indexOf('Kein eingebetteter Text') === -1) {
            stopTtsReading(true);
            var sessionId = ++state.ttsSessionId;
            state.ttsSpeaking = true;
            state.ttsPaused = false;
            state.ttsActiveBlockIndex = -1;
            updateTtsUiState('Liest Textfeld…', 'active');

            var rateEl = document.getElementById('ttsRateSelect');
            var rate = rateEl ? (parseFloat(rateEl.value) || 1.0) : 1.0;
            var voice = getSelectedTtsVoice();
            var u = new window.SpeechSynthesisUtterance(rawTxt);
            u.lang = (voice && voice.lang) ? voice.lang : 'de-DE';
            if (voice) u.voice = voice;
            u.rate = rate;
            u.onend = function () {
                if (state.ttsSessionId !== sessionId) return;
                state.ttsSpeaking = false;
                state.ttsPaused = false;
                updateTtsUiState('Fertig ✔', 'idle');
            };
            u.onerror = function () {
                if (state.ttsSessionId !== sessionId) return;
                state.ttsSpeaking = false;
                state.ttsPaused = false;
                updateTtsUiState('Bereit', 'idle');
            };
            window.speechSynthesis.speak(u);
            showToast('🔊 Vorlesen gestartet (aus Textfeld)', 'success');
            return;
        }

        setOcrStatusBox('ℹ️ <strong>Reiner Bild-Scan erkannt:</strong> Klicken Sie zuerst oben auf <strong>„🔎 In durchsuchbares PDF umwandeln“</strong>, damit der Text erkannt und vorgelesen werden kann!', 'info');
        showToast('Diese Seite enthält noch keinen Text (Scan). Bitte starten Sie erst „🔎 Durchsuchbares PDF“.', 'error');
    }

    function startTtsReadingFromBlock(startIndex) {
        if (!('speechSynthesis' in window)) {
            showToast('Ihr Browser unterstützt leider keine lokale Sprachausgabe (speechSynthesis).', 'error');
            return;
        }
        var doc = getActiveDoc();
        if (!doc) return;
        var blocks = state.currentPageTextBlocks || [];
        if (!blocks.length) {
            startTtsReadingPage();
            return;
        }

        var clampedStart = Math.max(0, Math.min(blocks.length - 1, startIndex || 0));
        stopTtsReading(true);
        initTtsVoices();
        revealRightDockSection('inspectorOcrSection');

        // Also fill #ocrOutputText with current page lines so user can read along in the right dock
        var outEl = document.getElementById('ocrOutputText');
        if (outEl) {
            var allLines = blocks.map(function (b) { return b.text; });
            outEl.value = '--- Seite ' + (doc.currentPage + 1) + ' ---\n' + allLines.join('\n');
        }

        var sessionId = ++state.ttsSessionId;
        state.ttsSpeaking = true;
        state.ttsPaused = false;
        state.ttsActiveBlockIndex = clampedStart;
        updateTtsUiState('Zeile ' + (clampedStart + 1) + '/' + blocks.length, 'active');
        redrawAnnotationOverlay();
        trackUsageEvent('tts_read_aloud');

        function speakNext(idx) {
            if (state.ttsSessionId !== sessionId) return;
            if (idx >= blocks.length) {
                state.ttsSpeaking = false;
                state.ttsPaused = false;
                state.ttsActiveBlockIndex = -1;
                updateTtsUiState('Fertig ✔', 'idle');
                redrawAnnotationOverlay();
                setStatus('Vorlesen von Seite ' + (doc.currentPage + 1) + ' abgeschlossen.');
                return;
            }

            var lineText = String((blocks[idx] && blocks[idx].text) || '').trim();
            if (!lineText) {
                speakNext(idx + 1);
                return;
            }

            state.ttsActiveBlockIndex = idx;
            updateTtsUiState('Zeile ' + (idx + 1) + '/' + blocks.length, 'active');
            setStatus('🔊 Liest Seite ' + (doc.currentPage + 1) + ' (Zeile ' + (idx + 1) + '/' + blocks.length + '): „' + lineText.substring(0, 65) + (lineText.length > 65 ? '…' : '') + '“');
            redrawAnnotationOverlay();

            var rateEl = document.getElementById('ttsRateSelect');
            var rate = rateEl ? (parseFloat(rateEl.value) || 1.0) : 1.0;
            var voice = getSelectedTtsVoice();

            var utter = new window.SpeechSynthesisUtterance(lineText);
            utter.lang = (voice && voice.lang) ? voice.lang : 'de-DE';
            if (voice) utter.voice = voice;
            utter.rate = rate;

            utter.onend = function () {
                if (state.ttsSessionId !== sessionId) return;
                speakNext(idx + 1);
            };
            utter.onerror = function () {
                if (state.ttsSessionId !== sessionId) return;
                speakNext(idx + 1);
            };

            window.speechSynthesis.speak(utter);
        }

        showToast('🔊 Vorlesen ab Zeile ' + (clampedStart + 1) + ' gestartet', 'success');
        speakNext(clampedStart);
    }

    async function runOcrOnCurrentPage() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument oder Bild.', 'error');
            return;
        }
        if (!window.Tesseract) {
            showToast('Tesseract OCR Bibliothek ist nicht geladen.', 'error');
            return;
        }

        if (state.viewMode !== 'editor') {
            await switchView('editor');
        }
        scrollOcrSectionIntoView();

        var lang = document.getElementById('ocrLang').value || 'deu';
        var pageNum = doc.currentPage + 1;
        setProgress(8, 'Starte Offline-OCR (' + lang + ')…');
        setStatus('Führe lokale Offline-Texterkennung (OCR) auf Seite ' + pageNum + ' aus…');
        setOcrStatusBox('⏳ <strong>Seiten-OCR (Seite ' + pageNum + '):</strong> Lade lokale Sprachdaten (' + escapeHtml(lang) + ')…', 'info');

        var worker = null;
        try {
            // Render current PDF page at high resolution (scale 2.0 = 144 DPI) for sharp OCR recognition
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            var jsPage = await pdfJsDoc.getPage(pageNum);
            var renderVp = jsPage.getViewport({ scale: 2.0 });
            var offCanvas = document.createElement('canvas');
            offCanvas.width = renderVp.width;
            offCanvas.height = renderVp.height;
            var offCtx = offCanvas.getContext('2d');
            offCtx.fillStyle = '#ffffff';
            offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
            await jsPage.render({ canvasContext: offCtx, viewport: renderVp }).promise;

            worker = await createOfflineTesseractWorker(lang, 'Seiten-OCR (S. ' + pageNum + ')');
            var result = await worker.recognize(offCanvas);
            await worker.terminate();
            worker = null;

            setProgress(null);
            var recognizedText = (result && result.data && result.data.text) ? result.data.text.trim() : '';
            var outBox = document.getElementById('ocrOutputText');
            if (outBox) {
                outBox.value = recognizedText || '(Kein Text auf dieser Seite erkannt)';
                outBox.focus();
            }
            var wordCount = recognizedText ? recognizedText.split(/\s+/).length : 0;
            setOcrStatusBox(
                '✔ <strong>Seiten-OCR abgeschlossen:</strong> ' + wordCount + ' Wörter auf Seite ' + pageNum + ' erkannt (siehe Textfeld unten).<br>' +
                '<em>Tipp: Klicken Sie auf „🔎 In durchsuchbares PDF umwandeln“, um den Text auch fest im PDF einzubetten!</em>',
                'success'
            );
            setStatus('Offline-OCR abgeschlossen (' + wordCount + ' Wörter erkannt)');
            trackUsageEvent('ocr_page_text');
            showToast('Offline-OCR abgeschlossen (' + wordCount + ' Wörter erkannt)!', 'success');
        } catch (err) {
            if (worker) {
                try { await worker.terminate(); } catch (e) {}
            }
            setProgress(null);
            var errMsg = (err && err.message) ? err.message : String(err);
            setOcrStatusBox('❌ <strong>OCR-Fehler:</strong> ' + escapeHtml(errMsg), 'error');
            showToast('OCR Fehler: ' + errMsg, 'error');
        }
    }

    function sanitizeOcrTextForPdf(str) {
        return String(str || '')
            .replace(/[„“”«»]/g, '"')
            .replace(/[‘’‚]/g, "'")
            .replace(/[–—]/g, '-')
            .replace(/€/g, 'EUR')
            .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
            .trim();
    }

    /**
     * Converts a scanned/image PDF into a true searchable Sandwich-PDF by running
     * offline Tesseract OCR and embedding an invisible, baseline-aligned text layer
     * directly over the scanned pages.
     */
    async function convertToSearchableSandwichPdf() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument oder Bild.', 'error');
            return;
        }
        if (!window.Tesseract) {
            showToast('Tesseract OCR Engine ist nicht verfügbar.', 'error');
            return;
        }

        scrollOcrSectionIntoView();
        await bakeAnnotationsIntoDocument(doc);

        var langEl = document.getElementById('ocrLang');
        var scopeEl = document.getElementById('ocrScope');
        var lang = langEl ? (langEl.value || 'deu') : 'deu';
        var scope = scopeEl ? (scopeEl.value || 'all') : 'all';

        var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var helvFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        var pdfPages = pdfDoc.getPages();

        var startPageIdx = scope === 'current' ? doc.currentPage : 0;
        var endPageIdx = scope === 'current' ? (doc.currentPage + 1) : pdfPages.length;
        var totalToProcess = endPageIdx - startPageIdx;

        setProgress(5, 'Initialisiere Sandwich-OCR (' + lang + ')…');
        setStatus('Erstelle durchsuchbares Sandwich-PDF (' + totalToProcess + ' Seite(n))…');
        setOcrStatusBox('⏳ <strong>Sandwich-OCR gestartet:</strong> Initialisiere lokale OCR-Engine (' + escapeHtml(lang) + ') für ' + totalToProcess + ' Seite(n)…', 'info');

        var worker = null;
        try {
            worker = await createOfflineTesseractWorker(lang, 'Sandwich-OCR');

            var fullExtractedText = [];
            var totalEmbeddedItems = 0;

            for (var pIdx = startPageIdx; pIdx < endPageIdx; pIdx++) {
                var stepNum = (pIdx - startPageIdx) + 1;
                var stepLabel = 'Seite ' + (pIdx + 1) + ' (' + stepNum + '/' + totalToProcess + ')';
                setStatus('Sandwich-OCR: Analysiere ' + stepLabel + '…');
                setOcrStatusBox('⏳ <strong>Sandwich-OCR:</strong> Analysiere ' + escapeHtml(stepLabel) + '…', 'info');

                var jsPage = await pdfJsDoc.getPage(pIdx + 1);
                var renderVp = jsPage.getViewport({ scale: 2.0 });

                var offCanvas = document.createElement('canvas');
                offCanvas.width = renderVp.width;
                offCanvas.height = renderVp.height;
                var offCtx = offCanvas.getContext('2d');
                offCtx.fillStyle = '#ffffff';
                offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
                await jsPage.render({ canvasContext: offCtx, viewport: renderVp }).promise;

                var ocrRes = await worker.recognize(offCanvas);
                var ocrData = (ocrRes && ocrRes.data) ? ocrRes.data : {};
                var pageText = (ocrData.text || '').trim();
                fullExtractedText.push('--- Seite ' + (pIdx + 1) + ' (Durchsuchbar hinterlegt) ---\n' + (pageText || '(Kein Text erkannt)'));

                var pdfPage = pdfPages[pIdx];

                // Isolate the page's original scanned image stream in /Artifact BMC q ... Q EMC
                // so any unclosed rotation/scaling cm matrix from scanner drivers is reset AND PAC 2026
                // recognizes the scan background as an Artifact while the OCR text layer is real content
                isolatePageGraphicsState(pdfPage, pdfDoc, true);

                // Activate PDF Text Rendering Mode 3 (3 Tr = Invisible OCR Text according to ISO 32000-1 / PDF/UA-1)
                if (typeof pdfPage.pushOperators === 'function' && PDFLib.PDFOperator && PDFLib.PDFNumber) {
                    pdfPage.pushOperators(PDFLib.PDFOperator.of('Tr', [PDFLib.PDFNumber.of(3)]));
                }

                var pageRot = ((renderVp.rotation % 360) + 360) % 360;
                var textRotation = PDFLib.degrees(pageRot);
                var vpScale = renderVp.scale || 2.0;

                var words = Array.isArray(ocrData.words) ? ocrData.words : [];
                var lines = Array.isArray(ocrData.lines) ? ocrData.lines : [];

                if (words.length > 0) {
                    for (var w = 0; w < words.length; w++) {
                        var wordObj = words[w];
                        var wText = sanitizeOcrTextForPdf(wordObj.text);
                        if (!wText || !wordObj.bbox) continue;

                        // Align all words on the same line to the line's vertical bounding box so PDF viewers
                        // and PDF.js group them cleanly as coherent horizontal text lines
                        var lineBbox = (wordObj.line && wordObj.line.bbox) ? wordObj.line.bbox : wordObj.bbox;
                        var vBoxH = Math.max(12, lineBbox.y1 - lineBbox.y0);
                        var ptBoxH = vBoxH / vpScale;
                        var fontSize = Math.max(6, Math.min(32, Math.round(ptBoxH * 0.78 * 10) / 10));

                        // Visual canvas coordinates (vx, vy) of the word's left baseline start
                        var vx = wordObj.bbox.x0;
                        var vy = lineBbox.y1 - (vBoxH * 0.15);

                        // Transform visual canvas coordinates into raw PDF space (handles /Rotate 0, 90, 180, 270 & CropBox)
                        var pdfPt = renderVp.convertToPdfPoint(vx, vy);

                        // Invisible OCR text layer via 3 Tr — preserves original visual scan 100% and passes PAC 2026 contrast checks!
                        pdfPage.drawText(wText + ' ', {
                            x: pdfPt[0],
                            y: pdfPt[1],
                            size: fontSize,
                            font: helvFont,
                            color: PDFLib.rgb(0, 0, 0),
                            rotate: textRotation
                        });
                        totalEmbeddedItems++;
                    }
                } else if (lines.length > 0) {
                    for (var l = 0; l < lines.length; l++) {
                        var lineObj = lines[l];
                        var lText = sanitizeOcrTextForPdf(lineObj.text);
                        if (!lText || !lineObj.bbox) continue;

                        var lVBoxH = Math.max(14, lineObj.bbox.y1 - lineObj.bbox.y0);
                        var lPtBoxH = lVBoxH / vpScale;
                        var lFontSize = Math.max(7, Math.min(32, Math.round(lPtBoxH * 0.78 * 10) / 10));
                        var lVx = lineObj.bbox.x0;
                        var lVy = lineObj.bbox.y1 - (lVBoxH * 0.15);
                        var lPdfPt = renderVp.convertToPdfPoint(lVx, lVy);

                        pdfPage.drawText(lText, {
                            x: lPdfPt[0],
                            y: lPdfPt[1],
                            size: lFontSize,
                            font: helvFont,
                            color: PDFLib.rgb(0, 0, 0),
                            rotate: textRotation
                        });
                        totalEmbeddedItems++;
                    }
                } else if (pageText) {
                    var rawLines = pageText.split(/\r?\n/);
                    var curVy = 40 * vpScale;
                    for (var r = 0; r < rawLines.length; r++) {
                        var cleanLine = sanitizeOcrTextForPdf(rawLines[r]);
                        if (!cleanLine) continue;
                        var rPdfPt = renderVp.convertToPdfPoint(36 * vpScale, curVy);
                        pdfPage.drawText(cleanLine, {
                            x: rPdfPt[0],
                            y: rPdfPt[1],
                            size: 10.5,
                            font: helvFont,
                            color: PDFLib.rgb(0, 0, 0),
                            rotate: textRotation
                        });
                        curVy += 14 * vpScale;
                        totalEmbeddedItems++;
                    }
                }
            }

            await worker.terminate();
            worker = null;

            doc.bytes = await pdfDoc.save();
            doc.modified = true;
            doc.ocrApplied = true;
            if (doc.name && !/-OCR\.pdf$/i.test(doc.name)) {
                doc.name = doc.name.replace(/\.pdf$/i, '') + '-OCR.pdf';
            }

            var outBox = document.getElementById('ocrOutputText');
            if (outBox) {
                outBox.value = fullExtractedText.join('\n\n');
            }

            setProgress(null);
            setStatus('Durchsuchbares Sandwich-PDF erstellt: ' + doc.name + ' (' + totalEmbeddedItems + ' Wörter hinterlegt)');
            await refreshDocumentViews();
            await updateAccessibilityUI(false);
            trackUsageEvent('ocr_searchable_pdf');

            if (totalEmbeddedItems > 0) {
                setOcrStatusBox(
                    '✔ <strong>Durchsuchbares Sandwich-PDF fertig!</strong><br>' +
                    'Es wurden <strong>' + totalEmbeddedItems + ' Wörter</strong> exakt unter dem Scanbild eingebettet.<br>' +
                    '• Nutzen Sie unten <strong>🔍 Im PDF suchen (<code>Strg+F</code>)</strong> zum Durchsuchen<br>' +
                    '• Oder klicken Sie auf <strong><code>I✎ Text ändern</code></strong> zum Umschreiben<br>' +
                    '• Über <strong><code>💾 Speichern</code></strong> laden Sie das durchsuchbare PDF als <code>' + escapeHtml(doc.name) + '</code> herunter.',
                    'success'
                );
                showToast(
                    'In durchsuchbares PDF umgewandelt (' + doc.name + ', ' + totalEmbeddedItems + ' Wörter hinterlegt)',
                    'success'
                );
            } else {
                setOcrStatusBox(
                    '⚠️ <strong>OCR abgeschlossen:</strong> Auf dieser Seite wurden keine lesbaren Textzeichen erkannt.',
                    'info'
                );
                showToast('OCR abgeschlossen, es wurde jedoch kein lesbarer Text auf der Seite gefunden.');
            }
        } catch (err) {
            if (worker) {
                try { await worker.terminate(); } catch (e) {}
            }
            setProgress(null);
            var errMsg = (err && err.message) ? err.message : String(err);
            setOcrStatusBox('❌ <strong>Fehler beim Erstellen des durchsuchbaren PDFs:</strong> ' + escapeHtml(errMsg), 'error');
            showToast('Fehler beim Erstellen des durchsuchbaren PDFs: ' + errMsg, 'error');
        }
    }

    // =========================================================================
    // Full-Text PDF Search (🔍 Im PDF suchen / Strg+F) with Canvas Highlighting
    // =========================================================================
    async function runPdfFullTextSearch(query, stepDirection) {
        var doc = getActiveDoc();
        var badgeEl = document.getElementById('pdfSearchCountBadge');
        if (!doc) {
            if (badgeEl) badgeEl.textContent = '0/0';
            return;
        }

        var cleanQuery = String(query || '').trim();
        if (!cleanQuery) {
            clearPdfFullTextSearch();
            return;
        }

        var lowerQ = cleanQuery.toLowerCase();

        // If same query is already active and user clicked Next/Prev, just step through matches
        if (state.pdfSearchQuery === lowerQ && state.pdfSearchMatches.length > 0 && typeof stepDirection === 'number') {
            var count = state.pdfSearchMatches.length;
            state.pdfSearchActiveIdx = (state.pdfSearchActiveIdx + stepDirection + count) % count;
            var targetMatch = state.pdfSearchMatches[state.pdfSearchActiveIdx];
            if (badgeEl) badgeEl.textContent = (state.pdfSearchActiveIdx + 1) + '/' + count;
            if (doc.currentPage !== targetMatch.pageIndex) {
                doc.currentPage = targetMatch.pageIndex;
                await renderCurrentEditorPage();
            } else {
                redrawAnnotationOverlay();
            }
            return;
        }

        state.pdfSearchQuery = lowerQ;
        state.pdfSearchMatches = [];
        state.pdfSearchActiveIdx = -1;

        var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
        var totalBlocksInDoc = 0;

        for (var p = 1; p <= pdfJsDoc.numPages; p++) {
            var pageIdx = p - 1;
            var page = await pdfJsDoc.getPage(p);
            var baseVp = page.getViewport({ scale: 1.0 });
            var blocks = await extractPageTextBlocks(page, baseVp);
            totalBlocksInDoc += blocks.length;

            for (var b = 0; b < blocks.length; b++) {
                var blk = blocks[b];
                var bTextLower = String(blk.text || '').toLowerCase();
                var pos = bTextLower.indexOf(lowerQ);
                while (pos !== -1) {
                    var totalLen = Math.max(1, blk.text.length);
                    var subX = blk.x + (pos / totalLen) * blk.w;
                    var subW = Math.max(14, (cleanQuery.length / totalLen) * blk.w);
                    state.pdfSearchMatches.push({
                        pageIndex: pageIdx,
                        x: subX,
                        y: blk.y,
                        w: subW,
                        h: blk.h,
                        text: blk.text
                    });
                    pos = bTextLower.indexOf(lowerQ, pos + lowerQ.length);
                }
            }

            // Also search inside unbaked text / edit-text annotations on this page
            var anns = getPageAnnotations(doc, pageIdx);
            for (var a = 0; a < anns.length; a++) {
                var ann = anns[a];
                if ((ann.type === 'text' || ann.type === 'edit-text') && ann.text) {
                    totalBlocksInDoc++;
                    if (String(ann.text).toLowerCase().indexOf(lowerQ) !== -1) {
                        state.pdfSearchMatches.push({
                            pageIndex: pageIdx,
                            x: ann.x,
                            y: ann.y,
                            w: ann.w || 80,
                            h: ann.h || 20,
                            text: ann.text
                        });
                    }
                }
            }
        }

        if (state.pdfSearchMatches.length === 0) {
            if (badgeEl) badgeEl.textContent = '0/0';
            redrawAnnotationOverlay();
            if (totalBlocksInDoc === 0) {
                showToast('Hinweis: Dieses PDF ist ein reiner Bild-Scan ohne Textebene. Klicken Sie rechts auf „🔎 In durchsuchbares PDF umwandeln“ (OCR)!', 'error');
                scrollOcrSectionIntoView();
                setOcrStatusBox('ℹ️ <strong>Reiner Bild-Scan erkannt:</strong> Klicken Sie oben auf <strong>„🔎 In durchsuchbares PDF umwandeln“</strong>, damit das PDF durchsuchbar wird!', 'info');
            } else {
                showToast('Kein Treffer für „' + cleanQuery + '“ im Dokument gefunden.');
            }
            return;
        }

        // Prefer first match on or after current page
        var bestIdx = 0;
        for (var m = 0; m < state.pdfSearchMatches.length; m++) {
            if (state.pdfSearchMatches[m].pageIndex >= doc.currentPage) {
                bestIdx = m;
                break;
            }
        }
        state.pdfSearchActiveIdx = bestIdx;
        if (badgeEl) {
            badgeEl.textContent = (bestIdx + 1) + '/' + state.pdfSearchMatches.length;
        }

        var activeMatch = state.pdfSearchMatches[bestIdx];
        if (doc.currentPage !== activeMatch.pageIndex) {
            doc.currentPage = activeMatch.pageIndex;
            await renderCurrentEditorPage();
        } else {
            redrawAnnotationOverlay();
        }
    }

    function clearPdfFullTextSearch() {
        state.pdfSearchQuery = '';
        state.pdfSearchMatches = [];
        state.pdfSearchActiveIdx = -1;
        var badgeEl = document.getElementById('pdfSearchCountBadge');
        if (badgeEl) badgeEl.textContent = '0/0';
        var inp = document.getElementById('pdfSearchInput');
        if (inp) inp.value = '';
        redrawAnnotationOverlay();
    }

    // =========================================================================
    // Barrierefreiheit (PDF/UA-1 • BITV 2.0 • WCAG 2.1) Audit & Auto-Remediation
    // =========================================================================
    function uint8ToLatin1Sample(bytes, maxBytes) {
        var len = maxBytes ? Math.min(bytes.byteLength, maxBytes) : bytes.byteLength;
        var chunks = [];
        var step = 8192;
        for (var i = 0; i < len; i += step) {
            var sub = bytes.subarray(i, Math.min(len, i + step));
            chunks.push(String.fromCharCode.apply(null, sub));
        }
        return chunks.join('');
    }

    function decodeRawPdfStreamToString(rawStream) {
        if (!rawStream) return '';
        try {
            var decBytes;
            if (rawStream instanceof PDFLib.PDFRawStream || (rawStream.contents && PDFLib.decodePDFRawStream)) {
                decBytes = PDFLib.decodePDFRawStream(rawStream).decode();
            } else if (typeof rawStream.getUnencodedContents === 'function') {
                decBytes = rawStream.getUnencodedContents();
            } else if (typeof rawStream.getContentsString === 'function') {
                decBytes = stringToLatin1Bytes(rawStream.getContentsString());
            } else if (PDFLib.decodePDFRawStream) {
                decBytes = PDFLib.decodePDFRawStream(rawStream).decode();
            }
            if (!decBytes) return '';
            return uint8ToLatin1Sample(decBytes, decBytes.byteLength);
        } catch (e) {
            return '';
        }
    }

    async function auditDocumentAccessibility(doc, quickMode) {
        if (!doc) return null;
        await bakeAnnotationsIntoDocument(doc);

        var rawStr = uint8ToLatin1Sample(doc.bytes, quickMode ? 524288 : 2097152);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
        var context = pdfDoc.context;
        var catalog = pdfDoc.catalog;
        var pdfPages = pdfDoc.getPages();

        // ---------------------------------------------------------------------
        // 1. PAC 2026 [PDF/UA — Metadaten]: XMP-Stream im Catalog, pdfuaid:part=1 & dc:title
        // ---------------------------------------------------------------------
        var docTitle = (pdfDoc.getTitle() || '').trim();
        var metaLookup = catalog.lookup(PDFLib.PDFName.of('Metadata'));
        var xmpStr = decodeRawPdfStreamToString(metaLookup);
        var hasPdfUaPart1 = /<pdfuaid:part>\s*1\s*<\/pdfuaid:part>/i.test(xmpStr) || /pdfuaid:part=["']1["']/i.test(xmpStr);
        var hasXmpDcTitle = /<dc:title[\s>]/i.test(xmpStr);
        var hasXmpPacketHeader = xmpStr.indexOf('W5M0MpCehiHzreSzNTczkc9d') !== -1;
        var hasValidTitle = docTitle.length >= 3 && !/\.pdf$/i.test(docTitle);
        var hasPdfUaXmp = Boolean(metaLookup) && hasPdfUaPart1 && hasXmpDcTitle && hasXmpPacketHeader && hasValidTitle;

        // ---------------------------------------------------------------------
        // 2. PAC 2026 [PDF/UA — Dokumenteinstellungen]: /DisplayDocTitle true & /Marked true (/Suspects != true)
        // ---------------------------------------------------------------------
        var hasDisplayDocTitle = false;
        var vpDict = catalog.lookup(PDFLib.PDFName.of('ViewerPreferences'));
        if (vpDict && vpDict.get) {
            var ddt = vpDict.get(PDFLib.PDFName.of('DisplayDocTitle'));
            if (ddt && String(ddt) === 'true') hasDisplayDocTitle = true;
        }
        var hasMarked = false;
        var hasSuspects = false;
        var markDict = catalog.lookup(PDFLib.PDFName.of('MarkInfo'));
        if (markDict && markDict.get) {
            var mk = markDict.get(PDFLib.PDFName.of('Marked'));
            if (mk && String(mk) === 'true') hasMarked = true;
            var susp = markDict.get(PDFLib.PDFName.of('Suspects'));
            if (susp && String(susp) === 'true') hasSuspects = true;
        }
        var docSettingsPass = hasValidTitle && hasDisplayDocTitle && hasMarked && !hasSuspects;

        // ---------------------------------------------------------------------
        // 3. PAC 2026 [PDF/UA — Natürliche Sprache]: Gültiger BCP-47 Sprachcode in /Lang
        // ---------------------------------------------------------------------
        var langVal = '';
        var langObj = catalog.get(PDFLib.PDFName.of('Lang'));
        if (langObj) {
            langVal = String(langObj).replace(/^[(\s]+|[)\s]+$/g, '');
        }
        var hasLang = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(langVal);

        // ---------------------------------------------------------------------
        // 4. PAC 2026 [PDF/UA — Seiteninhalt (Content)] & [WCAG 1.4.3 Kontrast]:
        //    Echte Tiefenanalyse der Seiten-Content-Streams auf ungetaggte Operatoren (BT..ET, Pfade, Do)
        // ---------------------------------------------------------------------
        var maxStreamPages = quickMode ? Math.min(pdfPages.length, 10) : pdfPages.length;
        var untaggedTextOps = 0;
        var untaggedGraphicOps = 0;
        var taggedMcidBlocks = 0;
        var artifactBlocks = 0;
        var nestedTaggedInArtifact = 0;
        var lowContrastTextCount = 0;
        var pagesMissingTabsS = 0;
        var totalAnnotsCount = 0;
        var untaggedAnnotsCount = 0;
        var linkedUrisLower = {};

        for (var pIdx = 0; pIdx < pdfPages.length; pIdx++) {
            var pNode = pdfPages[pIdx].node;
            var tabsVal = pNode.get(PDFLib.PDFName.of('Tabs'));
            if (!tabsVal || String(tabsVal) !== '/S') {
                pagesMissingTabsS++;
            }

            var annotsArrObj = pNode.lookup(PDFLib.PDFName.of('Annots'));
            if (annotsArrObj && typeof annotsArrObj.asArray === 'function') {
                var aList = annotsArrObj.asArray();
                for (var a = 0; a < aList.length; a++) {
                    var aDict = context.lookup(aList[a]);
                    if (!aDict || typeof aDict.get !== 'function') continue;
                    var aSub = String(aDict.get(PDFLib.PDFName.of('Subtype')) || '');
                    if (aSub === '/Popup') continue;
                    totalAnnotsCount++;
                    var hasAnnotContents = Boolean(aDict.get(PDFLib.PDFName.of('Contents')) || aDict.get(PDFLib.PDFName.of('TU')));
                    var hasAnnotStructParent = Boolean(aDict.get(PDFLib.PDFName.of('StructParent')));
                    if (!hasAnnotContents || !hasAnnotStructParent) {
                        untaggedAnnotsCount++;
                    }
                    if (aSub === '/Link') {
                        var actObj = aDict.lookup ? aDict.lookup(PDFLib.PDFName.of('A')) : null;
                        if (actObj && typeof actObj.get === 'function') {
                            var uVal = actObj.lookup ? actObj.lookup(PDFLib.PDFName.of('URI')) : actObj.get(PDFLib.PDFName.of('URI'));
                            if (uVal) {
                                var decodedU = (typeof uVal.decodeText === 'function') ? uVal.decodeText() : String(uVal);
                                var rawU = decodedU.replace(/^[(\s]+|[)\s]+$/g, '').toLowerCase();
                                if (rawU) {
                                    linkedUrisLower[rawU] = true;
                                    linkedUrisLower[rawU.replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/+$/, '')] = true;
                                }
                            }
                        }
                    }
                }
            }

            if (pIdx >= maxStreamPages) continue;

            var cObj = pNode.get(PDFLib.PDFName.of('Contents'));
            var sRefs = [];
            if (cObj) {
                var lookedC = context.lookup(cObj);
                if (lookedC && typeof lookedC.asArray === 'function') {
                    sRefs = lookedC.asArray();
                } else {
                    sRefs = [cObj];
                }
            }

            var pageStreamParts = [];
            for (var s = 0; s < sRefs.length; s++) {
                var rawS = context.lookup(sRefs[s]);
                var decS = decodeRawPdfStreamToString(rawS);
                if (decS) pageStreamParts.push(decS);
            }
            if (pageStreamParts.length === 0) continue;

            var stmts = parsePdfContentStreamStatements(pageStreamParts.join('\n'));
            var mcStack = [];
            var inBt = false;
            var currentTrMode = 0;
            var currentTextLum = 0;
            var currentBgLum = 1.0;

            function srgbChannelToLinear(c) {
                var cl = Math.max(0, Math.min(1, c));
                return cl <= 0.03928 ? cl / 12.92 : Math.pow((cl + 0.055) / 1.055, 2.4);
            }
            function calcRelativeLuminance(r, g, b) {
                return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
            }

            for (var stIdx = 0; stIdx < stmts.length; stIdx++) {
                var st = stmts[stIdx];
                var op = st.op;

                if (op === 'BMC' || op === 'BDC') {
                    var tagOpnd = st.operands.length > 0 ? st.operands[0] : '';
                    var isArt = tagOpnd === '/Artifact';
                    var hasMcid = st.raw.indexOf('/MCID') !== -1;
                    if (isArt) artifactBlocks++;
                    if (hasMcid) taggedMcidBlocks++;
                    if (mcStack.indexOf('Artifact') !== -1 && hasMcid) {
                        nestedTaggedInArtifact++;
                    }
                    mcStack.push(isArt ? 'Artifact' : (hasMcid ? 'MCID' : 'Other'));
                    continue;
                }
                if (op === 'EMC') {
                    if (mcStack.length > 0) mcStack.pop();
                    continue;
                }
                if (op === 'BT') {
                    inBt = true;
                    currentTrMode = 0;
                    continue;
                }
                if (op === 'ET') {
                    inBt = false;
                    continue;
                }
                if (op === 'Tr' && st.operands.length > 0) {
                    currentTrMode = parseInt(st.operands[0], 10) || 0;
                    continue;
                }
                if (op === 'g' && st.operands.length >= 1) {
                    var gv = parseFloat(st.operands[0]);
                    if (!isNaN(gv)) {
                        var gCalc = calcRelativeLuminance(gv, gv, gv);
                        if (inBt) currentTextLum = gCalc;
                        else currentBgLum = gCalc;
                    }
                } else if (op === 'rg' && st.operands.length >= 3) {
                    var rv = parseFloat(st.operands[0]);
                    var grv = parseFloat(st.operands[1]);
                    var bv = parseFloat(st.operands[2]);
                    if (!isNaN(rv) && !isNaN(grv) && !isNaN(bv)) {
                        var rgCalc = calcRelativeLuminance(rv, grv, bv);
                        if (inBt) currentTextLum = rgCalc;
                        else currentBgLum = rgCalc;
                    }
                } else if (op === 'k' && st.operands.length >= 4) {
                    var cv = parseFloat(st.operands[0]);
                    var mv = parseFloat(st.operands[1]);
                    var yv = parseFloat(st.operands[2]);
                    var kv = parseFloat(st.operands[3]);
                    if (!isNaN(cv) && !isNaN(mv) && !isNaN(yv) && !isNaN(kv)) {
                        var cr = (1 - Math.min(1, cv)) * (1 - Math.min(1, kv));
                        var cg = (1 - Math.min(1, mv)) * (1 - Math.min(1, kv));
                        var cb = (1 - Math.min(1, yv)) * (1 - Math.min(1, kv));
                        var kCalc = calcRelativeLuminance(cr, cg, cb);
                        if (inBt) currentTextLum = kCalc;
                        else currentBgLum = kCalc;
                    }
                }

                if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
                    var opndClean = st.operands.join('').replace(/\s+/g, '');
                    if (opndClean !== '()' && opndClean !== '<>' && opndClean !== '[]') {
                        if (mcStack.length === 0) {
                            untaggedTextOps++;
                        }
                        if (inBt && currentTrMode !== 3) {
                            var lMax = Math.max(currentTextLum, currentBgLum);
                            var lMin = Math.min(currentTextLum, currentBgLum);
                            var contrastRatio = (lMax + 0.05) / (lMin + 0.05);
                            // Flag low contrast text against background (ratio < 4.5:1, excluding intentional white-on-dark >= 0.75)
                            if (contrastRatio < 4.5 && currentTextLum < 0.75) {
                                lowContrastTextCount++;
                            }
                        }
                    }
                } else if (op === 'Do' || op === 'sh' || op === 'EI' || op === 'S' || op === 's' || op === 'f' || op === 'F' || op === 'f*' || op === 'B' || op === 'B*' || op === 'b' || op === 'b*') {
                    if (mcStack.length === 0) {
                        untaggedGraphicOps++;
                    }
                }
            }
        }

        var isFullyTaggedContent =
            hasMarked &&
            (taggedMcidBlocks + artifactBlocks > 0) &&
            untaggedTextOps === 0 &&
            untaggedGraphicOps === 0 &&
            nestedTaggedInArtifact === 0;

        // ---------------------------------------------------------------------
        // 5. PAC 2026 [PDF/UA — Strukturbaum & Rollenzuordnung] & [WCAG 1.3.1 / 2.4.6 Überschriften]
        // ---------------------------------------------------------------------
        var stRootLookup = catalog.lookup(PDFLib.PDFName.of('StructTreeRoot'));
        var hasParentTree = Boolean(stRootLookup && stRootLookup.get && stRootLookup.get(PDFLib.PDFName.of('ParentTree')));
        if (hasParentTree && stRootLookup.lookup) {
            var ptDict = stRootLookup.lookup(PDFLib.PDFName.of('ParentTree'));
            if (ptDict && ptDict.lookup) {
                var numsArrObj = ptDict.lookup(PDFLib.PDFName.of('Nums'));
                if (numsArrObj && typeof numsArrObj.asArray === 'function') {
                    var numsItems = numsArrObj.asArray();
                    var prevPtKey = -Infinity;
                    for (var nIdx = 0; nIdx < numsItems.length; nIdx += 2) {
                        var curPtKey = parseInt(String(numsItems[nIdx]), 10);
                        if (!isNaN(curPtKey)) {
                            if (curPtKey <= prevPtKey) {
                                hasParentTree = false;
                                break;
                            }
                            prevPtKey = curPtKey;
                        }
                    }
                }
            }
        }
        var standardTypesRemappedInRoleMap = false;
        if (stRootLookup && stRootLookup.lookup) {
            var rmDict = stRootLookup.lookup(PDFLib.PDFName.of('RoleMap'));
            if (rmDict && typeof rmDict.entries === 'function') {
                var stdPdfTags = {
                    '/Document': 1, '/Part': 1, '/Art': 1, '/Sect': 1, '/Div': 1,
                    '/H': 1, '/H1': 1, '/H2': 1, '/H3': 1, '/H4': 1, '/H5': 1, '/H6': 1,
                    '/P': 1, '/L': 1, '/LI': 1, '/Lbl': 1, '/LBody': 1,
                    '/Table': 1, '/TR': 1, '/TH': 1, '/TD': 1, '/THead': 1, '/TBody': 1, '/TFoot': 1,
                    '/Span': 1, '/Quote': 1, '/Note': 1, '/Reference': 1, '/BibEntry': 1, '/Code': 1,
                    '/Link': 1, '/Annot': 1, '/Figure': 1, '/Formula': 1, '/Form': 1
                };
                var rmEntries = rmDict.entries();
                for (var rIdx = 0; rIdx < rmEntries.length; rIdx++) {
                    var rmKey = String(rmEntries[rIdx][0]);
                    if (stdPdfTags[rmKey]) {
                        standardTypesRemappedInRoleMap = true;
                        break;
                    }
                }
            }
        }

        // Inspect all indirect objects for Fonts, StructElems (H1..H6, Figure, Sect, Document)
        var indirectObjects = context.enumerateIndirectObjects();
        var totalFontsCount = 0;
        var unembeddedFontsCount = 0;
        var missingUnicodeFontsCount = 0;
        var missingCidToGidCount = 0;
        var mismatchedFontWidthsCount = 0;
        var hasDocumentRootElem = false;
        var hasSectElem = false;
        var headingLevelsFound = {};
        var figureCount = 0;
        var figuresMissingAltCount = 0;
        var emptyStructElemsCount = 0;
        var nonStandardStructTypesCount = 0;
        var incompleteLinkElemsCount = 0;
        var standardStructSet = {
            '/Document': 1, '/Part': 1, '/Art': 1, '/Sect': 1, '/Div': 1,
            '/BlockQuote': 1, '/Caption': 1, '/TOC': 1, '/TOCI': 1, '/Index': 1, '/NonStruct': 1, '/Private': 1,
            '/H': 1, '/H1': 1, '/H2': 1, '/H3': 1, '/H4': 1, '/H5': 1, '/H6': 1,
            '/P': 1, '/L': 1, '/LI': 1, '/Lbl': 1, '/LBody': 1,
            '/Table': 1, '/TR': 1, '/TH': 1, '/TD': 1, '/THead': 1, '/TBody': 1, '/TFoot': 1,
            '/Span': 1, '/Quote': 1, '/Note': 1, '/Reference': 1, '/BibEntry': 1, '/Code': 1,
            '/Link': 1, '/Annot': 1, '/Ruby': 1, '/RB': 1, '/RT': 1, '/RP': 1, '/Warichu': 1, '/WT': 1, '/WP': 1,
            '/Figure': 1, '/Formula': 1, '/Form': 1
        };

        for (var objIdx = 0; objIdx < indirectObjects.length; objIdx++) {
            var iObj = indirectObjects[objIdx][1];
            if (!iObj || typeof iObj.get !== 'function') continue;

            var tName = String(iObj.get(PDFLib.PDFName.of('Type')) || '');
            var sName = String(iObj.get(PDFLib.PDFName.of('Subtype')) || '');
            var structS = String(iObj.get(PDFLib.PDFName.of('S')) || '');

            // Check Structure Elements
            if (tName === '/StructElem' || (structS && !sName && iObj.get(PDFLib.PDFName.of('P')))) {
                if (structS === '/Document') hasDocumentRootElem = true;
                if (structS === '/Sect') hasSectElem = true;
                if (structS && !standardStructSet[structS]) {
                    nonStandardStructTypesCount++;
                }
                var kVal = iObj.lookup ? iObj.lookup(PDFLib.PDFName.of('K')) : iObj.get(PDFLib.PDFName.of('K'));
                var hasAltOrActual = Boolean(iObj.get(PDFLib.PDFName.of('Alt')) || iObj.get(PDFLib.PDFName.of('ActualText')));
                if (!hasAltOrActual) {
                    if (!kVal) {
                        emptyStructElemsCount++;
                    } else if (typeof kVal.size === 'function' && kVal.size() === 0) {
                        emptyStructElemsCount++;
                    }
                }
                if (/^\/H[1-6]$/.test(structS)) {
                    var hLvl = parseInt(structS.charAt(2), 10);
                    headingLevelsFound[hLvl] = (headingLevelsFound[hLvl] || 0) + 1;
                }
                if (structS === '/Figure') {
                    figureCount++;
                    if (!iObj.get(PDFLib.PDFName.of('Alt'))) {
                        figuresMissingAltCount++;
                    }
                }
                if (structS === '/Link') {
                    var hasObjrInLink = false;
                    var hasMcidInLink = false;
                    if (kVal && typeof kVal.asArray === 'function') {
                        var kArr = kVal.asArray();
                        for (var ki = 0; ki < kArr.length; ki++) {
                            var kItem = context.lookup(kArr[ki]) || kArr[ki];
                            var kStr = String(kItem || '').trim();
                            if (/^\d+$/.test(kStr)) {
                                hasMcidInLink = true;
                            } else if (kItem && typeof kItem.get === 'function') {
                                var kt = String(kItem.get(PDFLib.PDFName.of('Type')) || '');
                                var ks = String(kItem.get(PDFLib.PDFName.of('S')) || '');
                                if (kt === '/OBJR') hasObjrInLink = true;
                                if (kt === '/MCR' || ks === '/Span' || kItem.get(PDFLib.PDFName.of('MCID'))) hasMcidInLink = true;
                            }
                        }
                    }
                    if (!hasObjrInLink || !hasMcidInLink) {
                        incompleteLinkElemsCount++;
                    }
                }
            }

            // Check CIDFontType2
            if (sName === '/CIDFontType2') {
                if (!iObj.get(PDFLib.PDFName.of('CIDToGIDMap'))) {
                    missingCidToGidCount++;
                }
                var cidDesc = iObj.lookup ? iObj.lookup(PDFLib.PDFName.of('FontDescriptor')) : null;
                var cidHasFile = Boolean(cidDesc && cidDesc.get && (
                    cidDesc.get(PDFLib.PDFName.of('FontFile')) ||
                    cidDesc.get(PDFLib.PDFName.of('FontFile2')) ||
                    cidDesc.get(PDFLib.PDFName.of('FontFile3'))
                ));
                if (!cidHasFile) {
                    unembeddedFontsCount++;
                }
                continue;
            }

            // Check Simple & Type0 Fonts
            if (sName === '/Type1' || sName === '/TrueType' || sName === '/MMType1') {
                totalFontsCount++;
                var fDesc = iObj.lookup ? iObj.lookup(PDFLib.PDFName.of('FontDescriptor')) : null;
                var hasFFile = Boolean(fDesc && fDesc.get && (
                    fDesc.get(PDFLib.PDFName.of('FontFile')) ||
                    fDesc.get(PDFLib.PDFName.of('FontFile2')) ||
                    fDesc.get(PDFLib.PDFName.of('FontFile3'))
                ));
                if (!hasFFile) {
                    unembeddedFontsCount++;
                }
                var hasToUni = Boolean(iObj.get(PDFLib.PDFName.of('ToUnicode')));
                if (!hasToUni) {
                    missingUnicodeFontsCount++;
                }
                // Check /FirstChar, /LastChar & /Widths array length consistency (Matterhorn 21-006)
                var fcObj = iObj.lookup ? iObj.lookup(PDFLib.PDFName.of('FirstChar')) : iObj.get(PDFLib.PDFName.of('FirstChar'));
                var lcObj = iObj.lookup ? iObj.lookup(PDFLib.PDFName.of('LastChar')) : iObj.get(PDFLib.PDFName.of('LastChar'));
                var wObj = iObj.lookup ? iObj.lookup(PDFLib.PDFName.of('Widths')) : iObj.get(PDFLib.PDFName.of('Widths'));
                if (!fcObj || !lcObj || !wObj) {
                    mismatchedFontWidthsCount++;
                } else if (typeof wObj.size === 'function') {
                    var fcNum = parseInt(String(fcObj), 10);
                    var lcNum = parseInt(String(lcObj), 10);
                    if (!isNaN(fcNum) && !isNaN(lcNum) && lcNum >= fcNum && wObj.size() !== (lcNum - fcNum + 1)) {
                        mismatchedFontWidthsCount++;
                    }
                }
            } else if (sName === '/Type0') {
                totalFontsCount++;
                if (!iObj.get(PDFLib.PDFName.of('ToUnicode'))) {
                    missingUnicodeFontsCount++;
                }
            }
        }

        var hasStructTree = Boolean(stRootLookup) && hasParentTree && hasDocumentRootElem && !standardTypesRemappedInRoleMap;
        var fontsPass = unembeddedFontsCount === 0 && missingUnicodeFontsCount === 0 && missingCidToGidCount === 0 && mismatchedFontWidthsCount === 0;
        var pagesTabsPass = pagesMissingTabsS === 0;

        // Check Heading Hierarchy (WCAG 1.3.1 & 2.4.6 / Matterhorn 14)
        var hasH1 = Boolean(headingLevelsFound[1] && headingLevelsFound[1] > 0);
        var skippedHeadingLevel = false;
        var maxHeadingLvl = 0;
        for (var hl = 1; hl <= 6; hl++) {
            if (headingLevelsFound[hl]) maxHeadingLvl = hl;
        }
        for (var checkHl = 1; checkHl <= maxHeadingLvl; checkHl++) {
            if (!headingLevelsFound[checkHl]) {
                skippedHeadingLevel = true;
                break;
            }
        }
        var headingsPass = hasH1 && !skippedHeadingLevel;

        // ---------------------------------------------------------------------
        // 7. Searchable Text & Unlinked Emails/URLs per Page (check via PDF.js — WCAG 1.4.5 & PAC Quality)
        // ---------------------------------------------------------------------
        var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
        var pagesToScan = quickMode ? Math.min(pdfJsDoc.numPages, 15) : pdfJsDoc.numPages;
        var pagesWithText = 0;
        var totalChars = 0;
        var unlinkedEmailsAndUrlsCount = 0;
        var detectedEmailsAndUrlsTotal = 0;
        var emailOrUrlPattern = /((?:mailto:\s*)?[a-zA-Z0-9äöüÄÖÜß._%+\-]+(?:\s*\.\s*[a-zA-Z0-9äöüÄÖÜß._%+\-]+)*\s*@\s*[a-zA-Z0-9äöüÄÖÜß\-]+(?:\s*\.\s*[a-zA-Z0-9äöüÄÖÜß\-]+)*\s*\.\s*[a-zA-Z]{2,24}|https?:\/\/[^\s<>()"']+|www\.[a-zA-Z0-9äöüÄÖÜß.\-]+\.[a-zA-Z]{2,24}[^\s<>()"']*)/gi;

        for (var p = 1; p <= pagesToScan; p++) {
            var page = await pdfJsDoc.getPage(p);
            var tc = await page.getTextContent({ includeMarkedContent: true });
            var tagStack = [];
            var plainItems = [];
            for (var tci = 0; tci < tc.items.length; tci++) {
                var tcIt = tc.items[tci];
                if (!tcIt) continue;
                if (tcIt.type === 'beginMarkedContentProps' || tcIt.type === 'beginMarkedContent') {
                    tagStack.push(tcIt.tag || '');
                    continue;
                }
                if (tcIt.type === 'endMarkedContent') {
                    if (tagStack.length > 0) tagStack.pop();
                    continue;
                }
                if (typeof tcIt.str === 'string' && tcIt.str.length > 0) {
                    var activeTag = tagStack.length > 0 ? tagStack[tagStack.length - 1] : '';
                    if (activeTag === 'Artifact') continue;
                    plainItems.push({ str: tcIt.str, tag: activeTag });
                }
            }
            var pageText = plainItems.map(function (it) { return it.str; }).join(' ').trim();
            if (pageText.length > 0) {
                pagesWithText++;
                totalChars += pageText.length;
                for (var piIdx = 0; piIdx < plainItems.length; piIdx++) {
                    var pItem = plainItems[piIdx];
                    var mArr = pItem.str.match(emailOrUrlPattern);
                    if (mArr) {
                        for (var mi = 0; mi < mArr.length; mi++) {
                            var tok = mArr[mi].replace(/[\u00AD\u200B]/g, '').replace(/[.,;:!?)\]>]+$/, '').replace(/^[([<]+/, '').trim();
                            if (tok.length < 5) continue;
                            detectedEmailsAndUrlsTotal++;
                            var isEm = tok.indexOf('@') !== -1 && !/^https?:\/\//i.test(tok);
                            var compactTok = isEm ? tok.replace(/\s+/g, '') : tok;
                            var normTok = compactTok.toLowerCase().replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
                            var fullMailto = 'mailto:' + normTok;
                            var fullHttp = 'http://' + normTok;
                            var fullHttps = 'https://' + normTok;
                            var hasAnnotUri = Boolean(linkedUrisLower[normTok] || linkedUrisLower[fullMailto] || linkedUrisLower[fullHttp] || linkedUrisLower[fullHttps]);
                            if (!hasAnnotUri || pItem.tag !== 'Link') {
                                unlinkedEmailsAndUrlsCount++;
                            }
                        }
                    }
                }
            }
        }
        var hasSearchableText = pagesWithText > 0 && totalChars > 0;
        var contrastAndTextPass = hasSearchableText && lowContrastTextCount === 0;

        // Alt-Text & Annotations (WCAG 1.1.1, 2.4.4, 4.1.2)
        var altAndAnnotsPass = figuresMissingAltCount === 0 && untaggedAnnotsCount === 0 && isFullyTaggedContent;

        // Outlines & Navigation (WCAG 2.4.1 & 2.4.5)
        var hasOutlines = Boolean(catalog.get(PDFLib.PDFName.of('Outlines')));
        var navigationPass = hasOutlines && hasSectElem;

        // PAC Quality checks
        var qualityStructurePass = hasStructTree && emptyStructElemsCount === 0 && nonStandardStructTypesCount === 0 && !standardTypesRemappedInRoleMap;
        var qualityLinksAndOutlinesPass = unlinkedEmailsAndUrlsCount === 0 && incompleteLinkElemsCount === 0 && hasOutlines && headingsPass;

        // Security (PDF/UA 26-001)
        var isEncryptedLocked = rawStr.indexOf('/Encrypt') !== -1;

        var checks = [
            // === TEIL 1: PAC 2026 — PDF/UA-1 (ISO 14289-1 / Matterhorn-Protokoll) ===
            {
                id: 'pdfua_xmp',
                category: 'PDF/UA',
                title: '1. [PDF/UA • Metadaten] XMP-Stream, pdfuaid:part=1 & dc:title-Synchronisation',
                standard: 'PAC 2026 Metadata • Matterhorn 06-001..004, 07-001',
                passed: hasPdfUaXmp,
                status: hasPdfUaXmp ? 'pass' : 'fail',
                detail: hasPdfUaXmp
                    ? 'XMP-Metadaten-Stream im Catalog mit pdfuaid:part=1 und dc:title ("' + docTitle + '") ist 1:1 synchron.'
                    : 'XMP-Metadaten-Stream fehlt, enthält kein pdfuaid:part=1 oder weicht vom /Info-Titel ab.'
            },
            {
                id: 'doc_settings',
                category: 'PDF/UA',
                title: '2. [PDF/UA • Dokument] Fenstertitel (/DisplayDocTitle true) & /Marked true',
                standard: 'PAC 2026 Document • Matterhorn 01-001, 01-002, 06-002',
                passed: docSettingsPass,
                status: docSettingsPass ? 'pass' : 'fail',
                detail: docSettingsPass
                    ? '/DisplayDocTitle true, /Marked true und /Suspects false sind im Catalog gesetzt.'
                    : 'Fehlt: ' + (!hasValidTitle ? 'Aussagekräftiger /Title fehlt. ' : '') + (!hasDisplayDocTitle ? '/DisplayDocTitle true fehlt. ' : '') + (!hasMarked ? '/Marked true fehlt.' : '')
            },
            {
                id: 'lang',
                category: 'PDF/UA',
                title: '3. [PDF/UA • Natürliche Sprache] Gültiger BCP-47 Sprachcode (/Lang)',
                standard: 'PAC 2026 Natural Language • Matterhorn 11-001',
                passed: hasLang,
                status: hasLang ? 'pass' : 'fail',
                detail: hasLang
                    ? 'Dokumentsprache im Catalog definiert: ' + langVal
                    : 'Kein gültiger BCP-47 Sprachcode (/Lang, z. B. de-DE) im PDF-Catalog hinterlegt.'
            },
            {
                id: 'marked_content',
                category: 'PDF/UA',
                title: '4. [PDF/UA • Inhalt] Vollständiges Content-Stream-Tagging (BDC/MCID & /Artifact)',
                standard: 'PAC 2026 Content • Matterhorn 01-001..01-005',
                passed: isFullyTaggedContent,
                status: isFullyTaggedContent ? 'pass' : 'fail',
                detail: isFullyTaggedContent
                    ? 'Alle Seiten-Streams vollständig getaggt (' + taggedMcidBlocks + ' MCID-Blöcke, ' + artifactBlocks + ' /Artifact-Blöcke, 0 ungetaggte Elemente).'
                    : 'Content-Stream-Fehler: ' + untaggedTextOps + ' ungetaggte Text-Op(s), ' + untaggedGraphicOps + ' ungetaggte Grafik/Pfad-Op(s), ' + nestedTaggedInArtifact + ' verschachtelte Artefakte.'
            },
            {
                id: 'struct_tree',
                category: 'PDF/UA',
                title: '5. [PDF/UA • Strukturbaum & Rollen] <Document>, /ParentTree & /RoleMap-Prüfung',
                standard: 'PAC 2026 Structure & RoleMap • Matterhorn 01-002, 02-004, 09-001',
                passed: hasStructTree,
                status: hasStructTree ? 'pass' : 'fail',
                detail: hasStructTree
                    ? '<Document>-Wurzel, /ParentTree-Index vorhanden und keine Standard-Tags in /RoleMap überschrieben.'
                    : standardTypesRemappedInRoleMap
                        ? 'Fehler (Matterhorn 02-004): Standard-Tags (z. B. Document, P, H1) dürfen nicht in /RoleMap umgemappt werden.'
                        : 'Vollständiger Strukturbaum (<Document>-Wurzel und /ParentTree-Rückverweise) fehlt.'
            },
            {
                id: 'fonts',
                category: 'PDF/UA',
                title: '6. [PDF/UA • Schriftarten] Vollständige Schrifteinbettung (/FontFile2), /Widths & /ToUnicode',
                standard: 'PAC 2026 Fonts • Matterhorn 21-001..21-007',
                passed: fontsPass,
                status: fontsPass ? 'pass' : 'fail',
                detail: fontsPass
                    ? 'Alle ' + totalFontsCount + ' Schrift(en) besitzen eingebettete Font-Programme (/FontFile2), konsistente /Widths und /ToUnicode-Tabellen.'
                    : 'Schrift-Fehler: ' + unembeddedFontsCount + ' nicht eingebettet (/FontFile fehlt), ' + missingUnicodeFontsCount + ' ohne /ToUnicode-CMap, ' + missingCidToGidCount + ' ohne /CIDToGIDMap' + (mismatchedFontWidthsCount > 0 ? ', ' + mismatchedFontWidthsCount + ' mit abweichenden /Widths (Matterhorn 21-006).' : '.')
            },
            {
                id: 'pages_tabs',
                category: 'PDF/UA',
                title: '7. [PDF/UA • Seiten] Tabulator-Reihenfolge folgt Struktur (/Tabs /S auf allen Seiten)',
                standard: 'PAC 2026 Pages • Matterhorn 18-001 • WCAG 2.4.3',
                passed: pagesTabsPass,
                status: pagesTabsPass ? 'pass' : 'fail',
                detail: pagesTabsPass
                    ? 'Alle ' + pdfPages.length + ' Seite(n) besitzen den Eintrag /Tabs /S.'
                    : pagesMissingTabsS + ' von ' + pdfPages.length + ' Seite(n) fehlt der Eintrag /Tabs /S.'
            },
            {
                id: 'security',
                category: 'PDF/UA',
                title: '8. [PDF/UA • Sicherheit] Screenreader-Zugriff nicht durch Verschlüsselung blockiert',
                standard: 'PAC 2026 Security • Matterhorn 26-001',
                passed: !isEncryptedLocked,
                status: !isEncryptedLocked ? 'pass' : 'fail',
                detail: !isEncryptedLocked
                    ? 'Textextraktion für Assistenztechnologien ist uneingeschränkt freigegeben.'
                    : 'Verschlüsselung (/Encrypt) gefunden — Screenreader-Zugriff eingeschränkt.'
            },

            // === TEIL 2: PAC 2026 — WCAG 2.1 / 2.2 & BITV 2.0 KONFORMITÄT ===
            {
                id: 'wcag_headings',
                category: 'WCAG',
                title: '9. [WCAG 1.3.1 & 2.4.6] Logische Überschriftenhierarchie (<H1>–<H6> ohne Ebenensprung)',
                standard: 'PAC 2026 WCAG • WCAG 1.3.1, 2.4.6 • Matterhorn 14-001..003',
                passed: headingsPass,
                status: headingsPass ? 'pass' : 'fail',
                detail: headingsPass
                    ? 'Gültige Überschriftenhierarchie mit <H1>-Hauptüberschrift (' + (headingLevelsFound[1] || 0) + 'x <H1>' + (headingLevelsFound[2] ? ', ' + headingLevelsFound[2] + 'x <H2>' : '') + ') ohne übersprungene Ebenen.'
                    : !hasH1
                        ? 'Fehlt: Dokument enthält keine <H1>-Hauptüberschrift im Strukturbaum.'
                        : 'Fehler: Überschriftenebenen wurden übersprungen (z. B. H1 direkt auf H3).'
            },
            {
                id: 'wcag_alt_annots',
                category: 'WCAG',
                title: '10. [WCAG 1.1.1, 2.4.4 & 4.1.2] Alternativtexte, Links (<Link> /OBJR) & Formulare',
                standard: 'PAC 2026 WCAG • WCAG 1.1.1, 2.4.4, 4.1.2 • Matterhorn 13, 28',
                passed: altAndAnnotsPass,
                status: altAndAnnotsPass ? 'pass' : 'fail',
                detail: altAndAnnotsPass
                    ? 'Alle Grafiken/Artefakte und ' + totalAnnotsCount + ' interaktive Annotation(en) sind regelkonform getaggt.'
                    : (figuresMissingAltCount > 0 ? figuresMissingAltCount + ' <Figure>-Element(e) ohne /Alt. ' : '') +
                      (untaggedAnnotsCount > 0 ? untaggedAnnotsCount + ' Link/Formular-Annotation(en) ohne /StructParent oder /Contents. ' : '') +
                      (!isFullyTaggedContent ? 'Seiten enthalten noch unmarkierte Grafiken.' : '')
            },
            {
                id: 'wcag_contrast_text',
                category: 'WCAG',
                title: '11. [WCAG 1.4.3 & 1.4.5] AA-Textkontrast (≥ 4,5:1) & Durchsuchbarer Text-Layer',
                standard: 'PAC 2026 WCAG • WCAG 1.4.3 (Kontrast), 1.4.5 (Text statt Bild)',
                passed: contrastAndTextPass,
                status: contrastAndTextPass ? 'pass' : 'fail',
                detail: contrastAndTextPass
                    ? pagesWithText + ' von ' + pdfJsDoc.numPages + ' Seite(n) durchsuchbar (' + totalChars + ' Zeichen) & AA-Farbkontrast (≥ 4,5:1) eingehalten.'
                    : !hasSearchableText
                        ? '0 Zeichen auslesbarer Text gefunden (reiner Bild-Scan).'
                        : lowContrastTextCount + ' Text-Farboperation(en) unterschreiten den Mindestkontrast von 4,5:1 (zu helles Grau).'
            },
            {
                id: 'wcag_navigation',
                category: 'WCAG',
                title: '12. [WCAG 2.4.1 & 2.4.5] Blöcke umgehen, Lesezeichen (/Outlines) & <Sect>-Gliederung',
                standard: 'PAC 2026 WCAG • WCAG 2.4.1, 2.4.5 • BITV 2.0 Navigation',
                passed: navigationPass,
                status: navigationPass ? 'pass' : 'fail',
                detail: navigationPass
                    ? 'Lesezeichen-Baum (/Outlines) und semantische <Sect>-Abschnittsgliederung vorhanden.'
                    : 'Fehlt: ' + (!hasOutlines ? 'Keine Lesezeichen (/Outlines) vorhanden. ' : '') + (!hasSectElem ? 'Keine <Sect>-Abschnittsstruktur vorhanden.' : '')
            },
            // === TEIL 3: PAC 2026 — Quality (Best Practices & E-Mail/URL-Verlinkung) ===
            {
                id: 'quality_structure',
                category: 'Quality',
                title: '13. [Quality • Struktur] Keine leeren Struktur-Tags & direkte PDF-Standard-Rollen ohne RoleMap-Umwege',
                standard: 'PAC 2026 Quality • PDF Association Best Practice (Empty Tags & RoleMap)',
                passed: qualityStructurePass,
                status: qualityStructurePass ? 'pass' : 'fail',
                detail: qualityStructurePass
                    ? '0 leere Struktur-Tags und 100 % native PDF-Standard-Tags (/H1, /H2, /P, /Sect, /Link, /Figure).'
                    : (emptyStructElemsCount > 0 ? emptyStructElemsCount + ' leere(s) Struktur-Tag(s) ohne Inhalt. ' : '') +
                      (nonStandardStructTypesCount > 0 ? nonStandardStructTypesCount + ' Nicht-Standard-Tag(s) gefunden. ' : '') +
                      (standardTypesRemappedInRoleMap ? 'Standard-Tags in /RoleMap umdefiniert.' : '')
            },
            {
                id: 'quality_links_bookmarks',
                category: 'Quality',
                title: '14. [Quality • Verlinkung & Navigation] Vollständige <Link>-Elemente (MCID + /OBJR), E-Mail/URL-Verlinkung & Lesezeichen-Sync',
                standard: 'PAC 2026 Quality • Completeness of "Link" elements & Bookmarks',
                passed: qualityLinksAndOutlinesPass,
                status: qualityLinksAndOutlinesPass ? 'pass' : 'fail',
                detail: qualityLinksAndOutlinesPass
                    ? (detectedEmailsAndUrlsTotal > 0
                        ? 'Alle ' + detectedEmailsAndUrlsTotal + ' erkannten E-Mail-Adressen/URLs sind vollständig als <Link> (mit Text-MCID + /OBJR) getaggt und Lesezeichen sind synchron.'
                        : 'Alle <Link>-Elemente sind vollständig (Text-MCID + /OBJR), keine unverlinkten E-Mails/URLs und Lesezeichen sind synchron.')
                    : (incompleteLinkElemsCount > 0 ? incompleteLinkElemsCount + ' <Link>-Strukturelement(e) unvollständig (es fehlt die verknüpfte Text-MCID neben /OBJR). ' : '') +
                      (unlinkedEmailsAndUrlsCount > 0 ? unlinkedEmailsAndUrlsCount + ' E-Mail-Adresse(n) oder Web-URL(s) im Text sind noch nicht als klickbarer Link (/Subtype /Link) verknüpft. ' : '') +
                      (!hasOutlines ? 'Lesezeichen (/Outlines) fehlen. ' : '') +
                      (!headingsPass ? 'Überschriftenhierarchie unvollständig.' : '')
            }
        ];

        var pdfUaChecks = checks.filter(function (c) { return c.category === 'PDF/UA'; });
        var wcagChecks = checks.filter(function (c) { return c.category === 'WCAG'; });
        var qualityChecks = checks.filter(function (c) { return c.category === 'Quality'; });
        var pdfUaPassed = pdfUaChecks.filter(function (c) { return c.passed; }).length;
        var wcagPassed = wcagChecks.filter(function (c) { return c.passed; }).length;
        var qualityPassed = qualityChecks.filter(function (c) { return c.passed; }).length;

        var passedCount = checks.filter(function (c) { return c.passed; }).length;
        var score = Math.round((passedCount / checks.length) * 100);

        return {
            docName: doc.name,
            pageCount: pdfJsDoc.numPages,
            docTitle: docTitle || doc.name.replace(/\.pdf$/i, '').replace(/_/g, ' '),
            lang: langVal || 'de-DE',
            score: score,
            passedCount: passedCount,
            totalChecks: checks.length,
            pdfUaPassed: pdfUaPassed,
            pdfUaTotal: pdfUaChecks.length,
            wcagPassed: wcagPassed,
            wcagTotal: wcagChecks.length,
            qualityPassed: qualityPassed,
            qualityTotal: qualityChecks.length,
            checks: checks
        };
    }

    function createA11ySectionDividerElement(label, subText) {
        var hdr = document.createElement('div');
        hdr.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;' +
            'padding:6px 10px;margin-top:4px;background:var(--bg-card);' +
            'border:1px solid var(--border-strong);border-radius:6px;' +
            'font-size:11.5px;font-weight:800;color:var(--accent-primary);letter-spacing:0.2px;';
        hdr.innerHTML =
            '<span>' + escapeHtml(label) + '</span>' +
            '<span style="font-weight:600;font-size:11px;color:var(--text-secondary);">' + escapeHtml(subText || '') + '</span>';
        return hdr;
    }

    function createA11yCheckRowElement(chk) {
        var icon = chk.status === 'pass' ? '✔' : (chk.status === 'warn' ? '⚠' : '✕');
        var badgeColor = chk.status === 'pass' ? '#10b981' : (chk.status === 'warn' ? '#f59e0b' : '#ef4444');
        var statusLabel = chk.status === 'pass' ? 'Bestanden' : (chk.status === 'warn' ? 'Hinweis' : 'Fehler');

        var row = document.createElement('div');
        row.style.cssText =
            'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;' +
            'background:var(--bg-input);border:1px solid var(--border-subtle);border-left:4px solid ' + badgeColor + ';' +
            'border-radius:6px;padding:8px 12px;transition:opacity 0.18s ease, transform 0.18s ease;';
        row.innerHTML =
            '<div>' +
            '  <div style="font-weight:600;font-size:12.5px;color:var(--text-primary);">' + escapeHtml(chk.title) + '</div>' +
            '  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">' + escapeHtml(chk.detail) + '</div>' +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0;">' +
            '  <span style="display:inline-block;font-size:11px;font-weight:700;color:' + badgeColor + ';">' + icon + ' ' + statusLabel + '</span>' +
            '  <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + escapeHtml(chk.standard) + '</div>' +
            '</div>';
        return row;
    }

    async function updateAccessibilityUI(openModalWindow) {
        var doc = getActiveDoc();
        if (!doc) {
            await createNewBlankPdfTab();
            doc = getActiveDoc();
        }
        if (!doc) return;

        var scorePill = document.getElementById('a11yScorePill');
        var pdfUaBadge = document.getElementById('a11yPdfUaBadge');
        var wcagBadge = document.getElementById('a11yWcagBadge');
        var qualityBadge = document.getElementById('a11yQualityBadge');
        var sumTitle = document.getElementById('a11ySummaryTitle');
        var sumSub = document.getElementById('a11ySummarySub');
        var sumBanner = document.getElementById('a11ySummaryBanner');
        var listContainer = document.getElementById('a11yChecklistContainer');
        var progBox = document.getElementById('a11yAuditProgressBox');
        var progLabel = document.getElementById('a11yAuditStepLabel');
        var progPct = document.getElementById('a11yAuditStepPercent');
        var progFill = document.getElementById('a11yAuditProgressFill');
        var reRunBtn = document.getElementById('btnReRunA11yAudit');

        // When user explicitly opens or re-runs the audit, show modal immediately with live step-by-step progress
        if (openModalWindow) {
            trackUsageEvent('a11y_checked');
            openModal('modalAccessibility');
            if (reRunBtn) reRunBtn.disabled = true;
            if (scorePill) {
                scorePill.textContent = '⏳ …';
                scorePill.style.background = 'var(--accent-soft)';
                scorePill.style.color = 'var(--accent-primary)';
            }
            if (pdfUaBadge) pdfUaBadge.textContent = 'PDF/UA: …';
            if (wcagBadge) wcagBadge.textContent = 'WCAG: …';
            if (qualityBadge) qualityBadge.textContent = 'Quality: …';
            if (sumTitle) {
                sumTitle.textContent = '🔍 Prüfe PDF/UA-1, WCAG 2.1/2.2 & Quality (inkl. E-Mail/URL-Links) analog PAC 2026…';
            }
            if (sumSub) {
                sumSub.textContent = 'Analysiere Dokument: ' + doc.name + ' (' + doc.pageCount + ' Seiten)…';
            }
            if (listContainer) {
                listContainer.innerHTML = '';
            }
            if (progBox) {
                progBox.style.display = 'block';
                if (progFill) progFill.style.width = '5%';
                if (progPct) progPct.textContent = '5 %';
                if (progLabel) progLabel.textContent = '🔍 Lade PDF-Objektbaum, Content-Streams und XMP-Metadaten…';
            }
        }

        var startTimeMs = performance.now ? performance.now() : Date.now();
        var report = await auditDocumentAccessibility(doc, !openModalWindow);
        var rawElapsedMs = Math.max(1, Math.round((performance.now ? performance.now() : Date.now()) - startTimeMs));
        if (!report) {
            if (reRunBtn) reRunBtn.disabled = false;
            return;
        }

        // Update Right Sidebar Quick Badge
        var sideBadge = document.getElementById('inspectorA11yScoreBadge');
        if (sideBadge) {
            sideBadge.textContent = report.score + '% (' + report.passedCount + '/' + report.totalChecks + ')';
            sideBadge.style.color = report.score === 100 ? '#10b981' : (report.score >= 60 ? '#f59e0b' : '#ef4444');
        }

        // Update PAC 2026 PDF/UA, WCAG & Quality Sub-Badges
        if (pdfUaBadge) {
            var uaOk = report.pdfUaPassed === report.pdfUaTotal;
            pdfUaBadge.textContent = (uaOk ? '✔ ' : '✕ ') + 'PDF/UA: ' + report.pdfUaPassed + '/' + report.pdfUaTotal;
            pdfUaBadge.style.color = uaOk ? '#10b981' : '#ef4444';
            pdfUaBadge.style.borderColor = uaOk ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
        }
        if (wcagBadge) {
            var wcagOk = report.wcagPassed === report.wcagTotal;
            wcagBadge.textContent = (wcagOk ? '✔ ' : '✕ ') + 'WCAG: ' + report.wcagPassed + '/' + report.wcagTotal;
            wcagBadge.style.color = wcagOk ? '#10b981' : '#ef4444';
            wcagBadge.style.borderColor = wcagOk ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
        }
        if (qualityBadge) {
            var qualOk = report.qualityPassed === report.qualityTotal;
            qualityBadge.textContent = (qualOk ? '✔ ' : '✕ ') + 'Quality: ' + report.qualityPassed + '/' + report.qualityTotal;
            qualityBadge.style.color = qualOk ? '#10b981' : '#ef4444';
            qualityBadge.style.borderColor = qualOk ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
        }

        // Pre-fill Remediation Inputs
        var titleInput = document.getElementById('a11yFixTitle');
        if (titleInput) {
            titleInput.value = report.docTitle;
        }
        var langSelect = document.getElementById('a11yFixLang');
        if (langSelect && report.lang) {
            for (var i = 0; i < langSelect.options.length; i++) {
                if (langSelect.options[i].value.toLowerCase() === report.lang.toLowerCase()) {
                    langSelect.selectedIndex = i;
                    break;
                }
            }
        }

        // Visual step-by-step reveal with PAC 2026 section headers (PDF/UA vs. WCAG)
        if (openModalWindow && listContainer) {
            var lastCat = '';
            for (var stepIdx = 0; stepIdx < report.checks.length; stepIdx++) {
                var chkItem = report.checks[stepIdx];
                if (chkItem.category !== lastCat) {
                    lastCat = chkItem.category;
                    if (lastCat === 'PDF/UA') {
                        listContainer.appendChild(createA11ySectionDividerElement(
                            '📋 Reiter 1: PAC 2026 — PDF/UA-1 (ISO 14289-1 / Matterhorn-Protokoll)',
                            report.pdfUaPassed + ' von ' + report.pdfUaTotal + ' bestanden'
                        ));
                    } else if (lastCat === 'WCAG') {
                        listContainer.appendChild(createA11ySectionDividerElement(
                            '🌐 Reiter 2: PAC 2026 — WCAG 2.1 / 2.2 & BITV 2.0 Konformität',
                            report.wcagPassed + ' von ' + report.wcagTotal + ' bestanden'
                        ));
                    } else if (lastCat === 'Quality') {
                        listContainer.appendChild(createA11ySectionDividerElement(
                            '✨ Reiter 3: PAC 2026 — Quality (Best Practices, E-Mail/URL-Links & Tag-Hygiene)',
                            report.qualityPassed + ' von ' + report.qualityTotal + ' bestanden'
                        ));
                    }
                }
                var pct = Math.round(((stepIdx + 1) / report.checks.length) * 100);
                if (progFill) progFill.style.width = pct + '%';
                if (progPct) progPct.textContent = pct + ' %';
                if (progLabel) {
                    progLabel.textContent = 'Prüfe Kriterium ' + (stepIdx + 1) + '/' + report.checks.length + ': ' + chkItem.title;
                }
                setStatus('PAC-2026-Prüfung (' + pct + ' %): ' + chkItem.title + '…');
                var stepRow = createA11yCheckRowElement(chkItem);
                listContainer.appendChild(stepRow);
                listContainer.scrollTop = listContainer.scrollHeight;
                await new Promise(function (resolve) { setTimeout(resolve, 45); });
            }
            listContainer.scrollTop = 0;
            if (progBox) {
                setTimeout(function () {
                    progBox.style.display = 'none';
                }, 220);
            }
            if (reRunBtn) reRunBtn.disabled = false;
        } else if (listContainer) {
            listContainer.innerHTML = '';
            var prevCat = '';
            report.checks.forEach(function (chk) {
                if (chk.category !== prevCat) {
                    prevCat = chk.category;
                    if (prevCat === 'PDF/UA') {
                        listContainer.appendChild(createA11ySectionDividerElement(
                            '📋 Reiter 1: PAC 2026 — PDF/UA-1 (ISO 14289-1 / Matterhorn-Protokoll)',
                            report.pdfUaPassed + ' von ' + report.pdfUaTotal + ' bestanden'
                        ));
                    } else if (prevCat === 'WCAG') {
                        listContainer.appendChild(createA11ySectionDividerElement(
                            '🌐 Reiter 2: PAC 2026 — WCAG 2.1 / 2.2 & BITV 2.0 Konformität',
                            report.wcagPassed + ' von ' + report.wcagTotal + ' bestanden'
                        ));
                    } else if (prevCat === 'Quality') {
                        listContainer.appendChild(createA11ySectionDividerElement(
                            '✨ Reiter 3: PAC 2026 — Quality (Best Practices, E-Mail/URL-Links & Tag-Hygiene)',
                            report.qualityPassed + ' von ' + report.qualityTotal + ' bestanden'
                        ));
                    }
                }
                listContainer.appendChild(createA11yCheckRowElement(chk));
            });
        }

        // Render Modal Summary Header with Timestamp & Engine Speed Info
        var timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        scorePill.textContent = report.score + ' %';
        if (report.score === 100) {
            scorePill.style.background = 'rgba(16, 185, 129, 0.18)';
            scorePill.style.color = '#10b981';
            sumTitle.textContent = '✔ PDF/UA-1, WCAG 2.1/2.2 & Quality vollständig konform (' + report.passedCount + '/' + report.totalChecks + ' Prüfpunkte)';
        } else if (report.score >= 60) {
            scorePill.style.background = 'rgba(245, 158, 11, 0.18)';
            scorePill.style.color = '#f59e0b';
            sumTitle.textContent = '⚠ Abweichungen bei PDF/UA, WCAG oder Quality gefunden (' + report.passedCount + '/' + report.totalChecks + ' erfüllt)';
        } else {
            scorePill.style.background = 'rgba(239, 68, 68, 0.18)';
            scorePill.style.color = '#ef4444';
            sumTitle.textContent = '✕ Nicht barrierefrei — PDF/UA-, WCAG- & Quality-Anforderungen nicht erfüllt (' + report.passedCount + '/' + report.totalChecks + ')';
        }
        sumSub.textContent =
            'Geprüft: ' + report.docName + ' (' + report.pageCount + ' S.) • ' +
            'PDF/UA: ' + report.pdfUaPassed + '/' + report.pdfUaTotal + ' • WCAG: ' + report.wcagPassed + '/' + report.wcagTotal + ' • ' +
            'Quality: ' + report.qualityPassed + '/' + report.qualityTotal + ' • ' +
            'Stand: ' + timeStr + ' Uhr (' + rawElapsedMs + ' ms)';

        if (openModalWindow) {
            if (sumBanner) {
                sumBanner.style.borderColor = report.score === 100 ? '#10b981' : (report.score >= 60 ? '#f59e0b' : '#ef4444');
                setTimeout(function () {
                    sumBanner.style.borderColor = 'var(--border-strong)';
                }, 900);
            }
            setStatus('PAC-2026-Prüfung abgeschlossen: ' + report.score + ' % (PDF/UA ' + report.pdfUaPassed + '/' + report.pdfUaTotal + ', WCAG ' + report.wcagPassed + '/' + report.wcagTotal + ', Quality ' + report.qualityPassed + '/' + report.qualityTotal + ').');
            showToast('Prüfung abgeschlossen (' + timeStr + ' Uhr): ' + report.score + ' % (' + report.passedCount + '/' + report.totalChecks + ' Kriterien erfüllt)', report.score === 100 ? 'success' : 'info');
        }
        return report;
    }

    // Exact WinAnsi (32..255) glyph widths extracted from LiberationSans-Regular.ttf (1000 unitsPerEm scale)
    var LIBERATION_SANS_WINANSI_WIDTHS = [
        278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
        1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
        333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
        556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 750,
        556, 278, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 278, 611, 278,
        278, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 278, 500, 667,
        278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 552,
        400, 549, 333, 333, 333, 576, 537, 333, 333, 333, 365, 556, 834, 834, 834, 611,
        667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
        722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
        556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 549, 611, 556, 556, 556, 556, 500, 556, 500
    ];

    async function getLiberationSansTtfBytes() {
        if (state.liberationSansTtfBytes) return state.liberationSansTtfBytes;
        try {
            var resp = await fetch('assets/vendor/LiberationSans-Regular.ttf');
            if (!resp.ok) return null;
            var buf = await resp.arrayBuffer();
            state.liberationSansTtfBytes = new Uint8Array(buf);
            return state.liberationSansTtfBytes;
        } catch (e) {
            return null;
        }
    }

    function buildWinAnsiToUnicodeCMapString() {
        var cp1252Extra = {
            128: '20AC', 130: '201A', 131: '0192', 132: '201E', 133: '2026', 134: '2020', 135: '2021',
            136: '02C6', 137: '2030', 138: '0160', 139: '2039', 140: '0152', 142: '017D', 145: '2018',
            146: '2019', 147: '201C', 148: '201D', 149: '2022', 150: '2013', 151: '2014', 152: '02DC',
            153: '2122', 154: '0161', 155: '203A', 156: '0153', 158: '017E', 159: '0178'
        };
        var entries = [];
        for (var c = 32; c <= 255; c++) {
            var srcHex = ('0' + c.toString(16).toUpperCase()).slice(-2);
            var dstHex = cp1252Extra[c] ? cp1252Extra[c] : ('000' + c.toString(16).toUpperCase()).slice(-4);
            entries.push('<' + srcHex + '> <' + dstHex + '>');
        }
        var lines = [
            '/CIDInit /ProcSet findresource begin',
            '12 dict begin',
            'begincmap',
            '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
            '/CMapName /Adobe-Identity-UCS def',
            '/CMapType 2 def',
            '1 begincodespacerange',
            '<00> <FF>',
            'endcodespacerange'
        ];
        for (var i = 0; i < entries.length; i += 100) {
            var chunk = entries.slice(i, i + 100);
            lines.push(chunk.length + ' beginbfchar');
            for (var j = 0; j < chunk.length; j++) {
                lines.push(chunk[j]);
            }
            lines.push('endbfchar');
        }
        lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
        return lines.join('\n');
    }

    function stringToLatin1Bytes(str) {
        var out = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i++) {
            out[i] = str.charCodeAt(i) & 0xFF;
        }
        return out;
    }

    function parsePdfContentStreamStatements(src) {
        var stmts = [];
        var operands = [];
        var len = src.length;
        var i = 0;

        function isWs(ch) {
            return ch === 32 || ch === 10 || ch === 13 || ch === 9 || ch === 12 || ch === 0;
        }
        function isDelim(ch) {
            return ch === 40 || ch === 41 || ch === 60 || ch === 62 ||
                   ch === 91 || ch === 93 || ch === 123 || ch === 125 ||
                   ch === 47 || ch === 37;
        }

        while (i < len) {
            var c = src.charCodeAt(i);
            if (isWs(c)) {
                i++;
                continue;
            }
            // Comment %...
            if (c === 37) {
                while (i < len && src.charCodeAt(i) !== 10 && src.charCodeAt(i) !== 13) i++;
                continue;
            }
            // Literal string (...)
            if (c === 40) {
                var startStr = i;
                var depth = 1;
                i++;
                while (i < len && depth > 0) {
                    var sc = src.charCodeAt(i);
                    if (sc === 92) {
                        i += 2;
                        continue;
                    }
                    if (sc === 40) depth++;
                    else if (sc === 41) depth--;
                    i++;
                }
                operands.push(src.slice(startStr, i));
                continue;
            }
            // Dictionary <<...>> or Hex string <...>
            if (c === 60) {
                var startAngle = i;
                if (i + 1 < len && src.charCodeAt(i + 1) === 60) {
                    var dDepth = 1;
                    i += 2;
                    while (i < len && dDepth > 0) {
                        var dc = src.charCodeAt(i);
                        if (dc === 40) {
                            var pDepth = 1;
                            i++;
                            while (i < len && pDepth > 0) {
                                if (src.charCodeAt(i) === 92) { i += 2; continue; }
                                if (src.charCodeAt(i) === 40) pDepth++;
                                else if (src.charCodeAt(i) === 41) pDepth--;
                                i++;
                            }
                            continue;
                        }
                        if (dc === 60 && i + 1 < len && src.charCodeAt(i + 1) === 60) {
                            dDepth++;
                            i += 2;
                            continue;
                        }
                        if (dc === 62 && i + 1 < len && src.charCodeAt(i + 1) === 62) {
                            dDepth--;
                            i += 2;
                            continue;
                        }
                        i++;
                    }
                    operands.push(src.slice(startAngle, i));
                } else {
                    i++;
                    while (i < len && src.charCodeAt(i) !== 62) i++;
                    if (i < len) i++;
                    operands.push(src.slice(startAngle, i));
                }
                continue;
            }
            // Array [...]
            if (c === 91) {
                var startArr = i;
                var aDepth = 1;
                i++;
                while (i < len && aDepth > 0) {
                    var ac = src.charCodeAt(i);
                    if (ac === 40) {
                        var apDepth = 1;
                        i++;
                        while (i < len && apDepth > 0) {
                            if (src.charCodeAt(i) === 92) { i += 2; continue; }
                            if (src.charCodeAt(i) === 40) apDepth++;
                            else if (src.charCodeAt(i) === 41) apDepth--;
                            i++;
                        }
                        continue;
                    }
                    if (ac === 91) aDepth++;
                    else if (ac === 93) aDepth--;
                    i++;
                }
                operands.push(src.slice(startArr, i));
                continue;
            }
            // Name /Foo
            if (c === 47) {
                var startName = i;
                i++;
                while (i < len && !isWs(src.charCodeAt(i)) && !isDelim(src.charCodeAt(i))) i++;
                operands.push(src.slice(startName, i));
                continue;
            }
            // Stray closing delimiters
            if (c === 41 || c === 62 || c === 93 || c === 123 || c === 125) {
                i++;
                continue;
            }
            // Word (Number, boolean, null, or Operator)
            var startWord = i;
            while (i < len && !isWs(src.charCodeAt(i)) && !isDelim(src.charCodeAt(i))) i++;
            var word = src.slice(startWord, i);

            // Handle Inline Image BI ... ID ... EI as a single atomic graphic object
            if (word === 'BI') {
                var biStart = startWord;
                while (i < len) {
                    if (src.charCodeAt(i) === 69 && i + 1 < len && src.charCodeAt(i + 1) === 73 &&
                        isWs(src.charCodeAt(i - 1)) && (i + 2 >= len || isWs(src.charCodeAt(i + 2)))) {
                        i += 2;
                        break;
                    }
                    i++;
                }
                stmts.push({
                    op: 'EI',
                    operands: [],
                    raw: src.slice(biStart, i)
                });
                operands = [];
                continue;
            }

            if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(word) || word === 'true' || word === 'false' || word === 'null') {
                operands.push(word);
            } else {
                var rawStmt = operands.length > 0 ? (operands.join(' ') + ' ' + word) : word;
                stmts.push({
                    op: word,
                    operands: operands,
                    raw: rawStmt
                });
                operands = [];
            }
        }
        return stmts;
    }

    var ADOBE_GLYPH_TO_UNICODE_HEX = {
        space: '0020', exclam: '0021', quotedbl: '0022', numbersign: '0023', dollar: '0024', percent: '0025',
        ampersand: '0026', quotesingle: '0027', quoteright: '2019', quoteleft: '2018', parenleft: '0028', parenright: '0029',
        asterisk: '002A', plus: '002B', comma: '002C', hyphen: '002D', minus: '2212', period: '002E', slash: '002F',
        zero: '0030', one: '0031', two: '0032', three: '0033', four: '0034', five: '0035', six: '0036', seven: '0037', eight: '0038', nine: '0039',
        colon: '003A', semicolon: '003B', less: '003C', equal: '003D', greater: '003E', question: '003F', at: '0040',
        bracketleft: '005B', backslash: '005C', bracketright: '005D', asciicircum: '005E', underscore: '005F', grave: '0060',
        braceleft: '007B', bar: '007C', braceright: '007D', asciitilde: '007E',
        Euro: '20AC', euro: '20AC', quotesinglbase: '201A', quotedblbase: '201E', ellipsis: '2026', dagger: '2020', daggerdbl: '2021',
        circumflex: '02C6', perthousand: '2030', Scaron: '0160', scaron: '0161', guilsinglleft: '2039', guilsinglright: '203A',
        OE: '0152', oe: '0153', Zcaron: '017D', zcaron: '017E', quotedblleft: '201C', quotedblright: '201D',
        bullet: '2022', endash: '2013', emdash: '2014', tilde: '02DC', trademark: '2122', Ydieresis: '0178',
        nbspace: '00A0', nonbreakingspace: '00A0', exclamdown: '00A1', cent: '00A2', sterling: '00A3', currency: '00A4',
        yen: '00A5', brokenbar: '00A6', section: '00A7', dieresis: '00A8', copyright: '00A9', ordfeminine: '00AA',
        guillemotleft: '00AB', logicalnot: '00AC', sfthyphen: '00AD', softhyphen: '00AD', registered: '00AE', macron: '00AF',
        degree: '00B0', plusminus: '00B1', twosuperior: '00B2', threesuperior: '00B3', acute: '00B4', mu: '00B5', micro: '00B5',
        paragraph: '00B6', periodcentered: '00B7', middot: '00B7', cedilla: '00B8', onesuperior: '00B9', ordmasculine: '00BA',
        guillemotright: '00BB', onequarter: '00BC', onehalf: '00BD', threequarters: '00BE', questiondown: '00BF',
        Agrave: '00C0', Aacute: '00C1', Acircumflex: '00C2', Atilde: '00C3', Adieresis: '00C4', Aring: '00C5', AE: '00C6', Ccedilla: '00C7',
        Egrave: '00C8', Eacute: '00C9', Ecircumflex: '00CA', Edieresis: '00CB', Igrave: '00CC', Iacute: '00CD', Icircumflex: '00CE', Idieresis: '00CF',
        Eth: '00D0', Ntilde: '00D1', Ograve: '00D2', Oacute: '00D3', Ocircumflex: '00D4', Otilde: '00D5', Odieresis: '00D6', multiply: '00D7',
        Oslash: '00D8', Ugrave: '00D9', Uacute: '00DA', Ucircumflex: '00DB', Udieresis: '00DC', Yacute: '00DD', Thorn: '00DE', germandbls: '00DF',
        agrave: '00E0', aacute: '00E1', acircumflex: '00E2', atilde: '00E3', adieresis: '00E4', aring: '00E5', ae: '00E6', ccedilla: '00E7',
        egrave: '00E8', eacute: '00E9', ecircumflex: '00EA', edieresis: '00EB', igrave: '00EC', iacute: '00ED', icircumflex: '00EE', idieresis: '00EF',
        eth: '00F0', ntilde: '00F1', ograve: '00F2', oacute: '00F3', ocircumflex: '00F4', otilde: '00F5', odieresis: '00F6', divide: '00F7',
        oslash: '00F8', ugrave: '00F9', uacute: '00FA', ucircumflex: '00FB', udieresis: '00FC', yacute: '00FD', thorn: '00FE', ydieresis: '00FF',
        fi: 'FB01', fl: 'FB02'
    };

    function buildCustomDifferencesToUnicodeCMapString(diffArray, context) {
        var cp1252Extra = {
            128: '20AC', 130: '201A', 131: '0192', 132: '201E', 133: '2026', 134: '2020', 135: '2021',
            136: '02C6', 137: '2030', 138: '0160', 139: '2039', 140: '0152', 142: '017D', 145: '2018',
            146: '2019', 147: '201C', 148: '201D', 149: '2022', 150: '2013', 151: '2014', 152: '02DC',
            153: '2122', 154: '0161', 155: '203A', 156: '0153', 158: '017E', 159: '0178'
        };
        var codeMap = {};
        for (var c = 0; c <= 255; c++) {
            var baseCode = c < 32 ? (c + 32) : c;
            codeMap[c] = cp1252Extra[baseCode] ? cp1252Extra[baseCode] : ('000' + baseCode.toString(16).toUpperCase()).slice(-4);
        }
        if (diffArray && typeof diffArray.asArray === 'function') {
            var items = diffArray.asArray();
            var curCode = 0;
            for (var idx = 0; idx < items.length; idx++) {
                var it = context ? context.lookup(items[idx]) : items[idx];
                if (!it) continue;
                if (typeof it.asNumber === 'function') {
                    curCode = it.asNumber() & 0xFF;
                } else {
                    var gName = String(it).replace(/^\//, '');
                    var hexU = null;
                    if (gName.length === 1) {
                        hexU = ('000' + gName.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
                    } else if (ADOBE_GLYPH_TO_UNICODE_HEX[gName]) {
                        hexU = ADOBE_GLYPH_TO_UNICODE_HEX[gName];
                    } else if (/^uni([0-9A-Fa-f]{4})$/.test(gName)) {
                        hexU = RegExp.$1.toUpperCase();
                    } else if (/^u([0-9A-Fa-f]{4,6})$/.test(gName)) {
                        hexU = RegExp.$1.slice(-4).toUpperCase();
                    }
                    if (hexU && curCode >= 0 && curCode <= 255) {
                        codeMap[curCode] = hexU;
                    }
                    curCode++;
                }
            }
        }
        var entries = [];
        for (var k = 0; k <= 255; k++) {
            var srcHex = ('0' + k.toString(16).toUpperCase()).slice(-2);
            entries.push('<' + srcHex + '> <' + codeMap[k] + '>');
        }
        var lines = [
            '/CIDInit /ProcSet findresource begin',
            '12 dict begin',
            'begincmap',
            '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
            '/CMapName /Adobe-Identity-UCS def',
            '/CMapType 2 def',
            '1 begincodespacerange',
            '<00> <FF>',
            'endcodespacerange'
        ];
        for (var i = 0; i < entries.length; i += 100) {
            var chunk = entries.slice(i, i + 100);
            lines.push(chunk.length + ' beginbfchar');
            for (var j = 0; j < chunk.length; j++) {
                lines.push(chunk[j]);
            }
            lines.push('endbfchar');
        }
        lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
        return lines.join('\n');
    }

    function extractAsciiFromPdfTextOperand(rawOpnd) {
        if (!rawOpnd) return '';
        var out = [];
        var s = String(rawOpnd);
        var i = 0;
        var len = s.length;
        while (i < len) {
            var ch = s.charCodeAt(i);
            if (ch === 40) { // '('
                i++;
                var depth = 1;
                while (i < len && depth > 0) {
                    var c = s.charCodeAt(i);
                    if (c === 92 && i + 1 < len) { // '\'
                        var nextC = s.charAt(i + 1);
                        if (nextC >= '0' && nextC <= '7') {
                            var oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0];
                            out.push(String.fromCharCode(parseInt(oct, 8)));
                            i += 1 + oct.length;
                            continue;
                        }
                        out.push(nextC);
                        i += 2;
                        continue;
                    }
                    if (c === 40) { depth++; out.push('('); i++; continue; }
                    if (c === 41) { depth--; if (depth > 0) out.push(')'); i++; continue; }
                    out.push(s.charAt(i));
                    i++;
                }
                continue;
            }
            if (ch === 60 && (i + 1 >= len || s.charCodeAt(i + 1) !== 60)) { // '<hex>'
                var endHex = s.indexOf('>', i + 1);
                if (endHex !== -1) {
                    var hex = s.slice(i + 1, endHex).replace(/\s+/g, '');
                    if (hex.length >= 4 && hex.length % 4 === 0 && /^00[2-7][0-9A-Fa-f]/.test(hex)) {
                        for (var h4 = 0; h4 < hex.length; h4 += 4) {
                            var code4 = parseInt(hex.slice(h4, h4 + 4), 16);
                            if (code4 >= 32 && code4 <= 255) out.push(String.fromCharCode(code4));
                        }
                    } else {
                        for (var h2 = 0; h2 < hex.length; h2 += 2) {
                            var code2 = parseInt(hex.slice(h2, h2 + 2), 16);
                            if (code2 >= 32 && code2 <= 255) out.push(String.fromCharCode(code2));
                        }
                    }
                    i = endHex + 1;
                    continue;
                }
            }
            i++;
        }
        return out.join('');
    }

    function isPdfTextOperandLiterallyWhitespaceOnly(rawOpnd) {
        if (!rawOpnd) return true;
        var s = String(rawOpnd);
        var i = 0;
        var len = s.length;
        while (i < len) {
            var ch = s.charCodeAt(i);
            if (ch === 40) { // '('
                i++;
                var depth = 1;
                while (i < len && depth > 0) {
                    var c = s.charCodeAt(i);
                    if (c === 92 && i + 1 < len) { // '\'
                        var nextC = s.charAt(i + 1);
                        if (nextC >= '0' && nextC <= '7') {
                            var oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0];
                            var octCode = parseInt(oct, 8);
                            if (octCode > 32 && octCode !== 127 && octCode !== 160 && octCode !== 173) {
                                return false;
                            }
                            i += 1 + oct.length;
                            continue;
                        }
                        if (nextC !== 'n' && nextC !== 'r' && nextC !== 't' && nextC !== 'b' && nextC !== 'f' && nextC !== '\n' && nextC !== '\r') {
                            var escCode = nextC.charCodeAt(0);
                            if (escCode > 32 && escCode !== 127 && escCode !== 160 && escCode !== 173) {
                                return false;
                            }
                        }
                        i += 2;
                        continue;
                    }
                    if (c === 40) { depth++; return false; }
                    if (c === 41) {
                        depth--;
                        if (depth > 0) return false;
                        i++;
                        continue;
                    }
                    if (c > 32 && c !== 127 && c !== 160 && c !== 173) {
                        return false;
                    }
                    i++;
                }
                continue;
            }
            if (ch === 60 && (i + 1 >= len || s.charCodeAt(i + 1) !== 60)) { // '<hex>'
                var endHex = s.indexOf('>', i + 1);
                if (endHex !== -1) {
                    var hex = s.slice(i + 1, endHex).replace(/\s+/g, '');
                    // Never treat non-empty <hex> strings as whitespace in Pass 1 because in TrueType CID
                    // Identity-H fonts, <0020>, <0009>, <000A>, <000D> are Glyph IDs (visible characters!).
                    // Pass 2 decodes <hex> via the font's /ToUnicode CMap and demotes true whitespace MCIDs to /Artifact.
                    if (hex.length > 0) {
                        return false;
                    }
                    i = endHex + 1;
                    continue;
                }
            }
            i++;
        }
        return true;
    }

    function tagContentStreamStatementsForPdfUa(stmts, startMcid, forceInvisibleTextMode3, pageIndex) {
        var nextMcid = startMcid || 0;
        var mcidTags = [];
        var mcidRawTexts = [];
        var outLines = [];
        var idx = 0;
        var total = stmts.length;

        function isPathStartOp(op) {
            return op === 'm' || op === 're';
        }
        function isPathPaintOp(op) {
            return op === 'S' || op === 's' || op === 'f' || op === 'F' || op === 'f*' || op === 'B' || op === 'B*' || op === 'b' || op === 'b*' || op === 'n';
        }
        function srgbToLinear(c) {
            var cl = Math.max(0, Math.min(1, c));
            return cl <= 0.03928 ? cl / 12.92 : Math.pow((cl + 0.055) / 1.055, 2.4);
        }
        function calcRelLum(r, g, b) {
            return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
        }
        function enhanceTextColorStmtForWcagContrast(tst) {
            if (tst.op === 'g' && tst.operands.length >= 1) {
                var gv = parseFloat(tst.operands[0]);
                if (!isNaN(gv)) {
                    var gLum = calcRelLum(gv, gv, gv);
                    var gRatio = (1.0 + 0.05) / (gLum + 0.05);
                    if (gRatio < 4.5 && gLum < 0.75) {
                        return '0.22 g';
                    }
                }
            } else if (tst.op === 'rg' && tst.operands.length >= 3) {
                var r = parseFloat(tst.operands[0]);
                var g = parseFloat(tst.operands[1]);
                var b = parseFloat(tst.operands[2]);
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                    var lum = calcRelLum(r, g, b);
                    var ratio = (1.0 + 0.05) / (lum + 0.05);
                    if (ratio < 4.5 && lum < 0.75) {
                        var scale = Math.min(0.42, 0.16 / Math.max(0.05, lum));
                        return (r * scale).toFixed(3) + ' ' + (g * scale).toFixed(3) + ' ' + (b * scale).toFixed(3) + ' rg';
                    }
                }
            } else if (tst.op === 'k' && tst.operands.length >= 4) {
                var c = parseFloat(tst.operands[0]);
                var m = parseFloat(tst.operands[1]);
                var y = parseFloat(tst.operands[2]);
                var k = parseFloat(tst.operands[3]);
                if (!isNaN(c) && !isNaN(m) && !isNaN(y) && !isNaN(k)) {
                    var cr = (1 - Math.min(1, c)) * (1 - Math.min(1, k));
                    var cg = (1 - Math.min(1, m)) * (1 - Math.min(1, k));
                    var cb = (1 - Math.min(1, y)) * (1 - Math.min(1, k));
                    var kLum = calcRelLum(cr, cg, cb);
                    var kRatio = (1.0 + 0.05) / (kLum + 0.05);
                    if (kRatio < 4.5 && kLum < 0.75) {
                        var newK = Math.max(k, 0.78);
                        return c.toFixed(3) + ' ' + m.toFixed(3) + ' ' + y.toFixed(3) + ' ' + newK.toFixed(3) + ' k';
                    }
                }
            }
            return tst.raw;
        }

        while (idx < total) {
            var st = stmts[idx];
            var op = st.op;

            // 1. Strip any pre-existing BMC / BDC / EMC / MP / DP operators so our new structure tree is 100% consistent
            if (op === 'BMC' || op === 'BDC' || op === 'EMC' || op === 'MP' || op === 'DP') {
                idx++;
                continue;
            }

            // 2. Text Object (BT ... ET) — never contains q or Q per ISO 32000-1 Figure 9.
            //    Split multi-line BT...ET blocks on vertical line breaks into individual MCIDs
            //    while keeping each horizontal text line intact so email addresses and URLs are never split mid-token.
            if (op === 'BT') {
                var segments = [];
                var curSeg = { stmts: [], hasText: false, hasTextOp: false, rawTexts: [] };
                var lastTmY = null;
                idx++;
                while (idx < total) {
                    var tst = stmts[idx];
                    var top = tst.op;
                    if (top === 'BMC' || top === 'BDC' || top === 'EMC' || top === 'MP' || top === 'DP') {
                        idx++;
                        continue;
                    }
                    if (top === 'ET') {
                        idx++;
                        break;
                    }
                    var enhancedLine = enhanceTextColorStmtForWcagContrast(tst);
                    if (top === 'T*' && (curSeg.hasText || curSeg.hasTextOp)) {
                        segments.push(curSeg);
                        curSeg = { stmts: [], hasText: false, hasTextOp: false, rawTexts: [] };
                    } else if ((top === 'Td' || top === 'TD') && tst.operands.length >= 2) {
                        var tdy = parseFloat(tst.operands[1]) || 0;
                        if ((curSeg.hasText || curSeg.hasTextOp) && Math.abs(tdy) > 1.0) {
                            segments.push(curSeg);
                            curSeg = { stmts: [], hasText: false, hasTextOp: false, rawTexts: [] };
                        }
                    } else if (top === 'Tm' && tst.operands.length >= 6) {
                        var tmy = parseFloat(tst.operands[5]) || 0;
                        if ((curSeg.hasText || curSeg.hasTextOp) && lastTmY !== null && Math.abs(tmy - lastTmY) > 1.5) {
                            segments.push(curSeg);
                            curSeg = { stmts: [], hasText: false, hasTextOp: false, rawTexts: [] };
                        }
                        lastTmY = tmy;
                    }

                    if (top === 'Tj' || top === 'TJ' || top === "'" || top === '"') {
                        var opndJoined = tst.operands.join(' ');
                        curSeg.hasTextOp = true;
                        if (!isPdfTextOperandLiterallyWhitespaceOnly(opndJoined)) {
                            var extractedAscii = extractAsciiFromPdfTextOperand(opndJoined);
                            curSeg.hasText = true;
                            if (extractedAscii) curSeg.rawTexts.push(extractedAscii);
                        }
                        curSeg.stmts.push(enhancedLine);
                        if (top === "'" || top === '"') {
                            segments.push(curSeg);
                            curSeg = { stmts: [], hasText: false, hasTextOp: false, rawTexts: [] };
                        }
                    } else {
                        curSeg.stmts.push(enhancedLine);
                    }
                    idx++;
                }
                if (curSeg.stmts.length > 0) {
                    if (!curSeg.hasText && !curSeg.hasTextOp && segments.length > 0) {
                        for (var tsIdx = 0; tsIdx < curSeg.stmts.length; tsIdx++) {
                            segments[segments.length - 1].stmts.push(curSeg.stmts[tsIdx]);
                        }
                    } else {
                        segments.push(curSeg);
                    }
                }
                var textSegmentsCount = 0;
                for (var sc = 0; sc < segments.length; sc++) {
                    if (segments[sc].hasText) textSegmentsCount++;
                }
                if (textSegmentsCount === 0) {
                    outLines.push('/Artifact BMC');
                    outLines.push('BT');
                    if (forceInvisibleTextMode3) outLines.push('3 Tr');
                    for (var ns = 0; ns < segments.length; ns++) {
                        if (segments[ns].stmts.length > 0) {
                            outLines.push(segments[ns].stmts.join('\n'));
                        }
                    }
                    outLines.push('ET');
                    outLines.push('EMC');
                } else if (textSegmentsCount === 1 && segments.length === 1) {
                    var singleMcid = nextMcid++;
                    var singleTag = (pageIndex === 0 && singleMcid === 0) ? 'H1' : ((pageIndex > 0 && singleMcid === 0) ? 'H2' : 'P');
                    mcidTags.push(singleTag);
                    mcidRawTexts.push(segments[0].rawTexts.join(''));
                    outLines.push('/' + singleTag + ' <</MCID ' + singleMcid + '>> BDC');
                    outLines.push('BT');
                    if (forceInvisibleTextMode3) outLines.push('3 Tr');
                    outLines.push(segments[0].stmts.join('\n'));
                    outLines.push('ET');
                    outLines.push('EMC');
                } else {
                    outLines.push('BT');
                    if (forceInvisibleTextMode3) outLines.push('3 Tr');
                    for (var sg = 0; sg < segments.length; sg++) {
                        var segObj = segments[sg];
                        if (segObj.hasText) {
                            var segMcid = nextMcid++;
                            var segTag = (pageIndex === 0 && segMcid === 0) ? 'H1' : ((pageIndex > 0 && segMcid === 0) ? 'H2' : 'P');
                            mcidTags.push(segTag);
                            mcidRawTexts.push(segObj.rawTexts.join(''));
                            outLines.push('/' + segTag + ' <</MCID ' + segMcid + '>> BDC');
                            outLines.push(segObj.stmts.join('\n'));
                            outLines.push('EMC');
                        } else if (segObj.stmts.length > 0) {
                            if (segObj.hasTextOp) {
                                outLines.push('/Artifact BMC');
                                outLines.push(segObj.stmts.join('\n'));
                                outLines.push('EMC');
                            } else {
                                outLines.push(segObj.stmts.join('\n'));
                            }
                        }
                    }
                    outLines.push('ET');
                }
                continue;
            }

            // 3. Path Object (m/re ... S/s/f/F/f*/B/B*/b/b*/n) — keep entire path up to paint op inside one /Artifact block
            if (isPathStartOp(op)) {
                var pathBlock = [st.raw];
                idx++;
                while (idx < total) {
                    var pst = stmts[idx];
                    if (pst.op === 'BMC' || pst.op === 'BDC' || pst.op === 'EMC' || pst.op === 'MP' || pst.op === 'DP') {
                        idx++;
                        continue;
                    }
                    if (pst.op === 'BT' || pst.op === 'q' || pst.op === 'Q' || pst.op === 'Do' || pst.op === 'sh' || pst.op === 'EI') {
                        break;
                    }
                    pathBlock.push(pst.raw);
                    idx++;
                    if (isPathPaintOp(pst.op)) {
                        break;
                    }
                }
                outLines.push('/Artifact BMC');
                outLines.push(pathBlock.join('\n'));
                outLines.push('EMC');
                continue;
            }

            // 4. Standalone Path Paint, XObject (Do), Shading (sh), or Inline Image (EI)
            if (op === 'Do' || op === 'sh' || op === 'EI' || isPathPaintOp(op)) {
                outLines.push('/Artifact BMC');
                outLines.push(st.raw);
                outLines.push('EMC');
                idx++;
                continue;
            }

            // 5. Graphics State operators (q, Q, cm, gs, colors, line styles, etc.) stay outside BDC/BMC
            //    Never darken background rectangle colors outside BT...ET (and restore any previously darkened 0.171 0.173 0.173 rg footer box)
            if (st.op === 'rg' && st.raw.trim() === '0.171 0.173 0.173 rg') {
                outLines.push('0.937 0.945 0.949 rg');
            } else {
                outLines.push(st.raw);
            }
            idx++;
        }

        return {
            contentString: outLines.join('\n') + '\n',
            nextMcid: nextMcid,
            mcidTags: mcidTags,
            mcidRawTexts: mcidRawTexts
        };
    }

    async function embedPdfUaFontsIntoDocument(pdfDoc) {
        var ttfBytes = await getLiberationSansTtfBytes();
        if (!ttfBytes) return null;

        var context = pdfDoc.context;
        var fontFileRef = null;
        var fontDescRef = null;
        var toUnicodeRef = null;
        var widthsObjRef = null;
        var sharedFontDictRef = null;

        function ensureSharedFontObjects() {
            if (fontDescRef) return;
            var fontStream = context.flateStream(ttfBytes, {
                Length1: PDFLib.PDFNumber.of(ttfBytes.byteLength)
            });
            fontFileRef = context.register(fontStream);

            var cmapBytes = stringToLatin1Bytes(buildCustomDifferencesToUnicodeCMapString(null, context));
            var cmapStream = context.flateStream(cmapBytes);
            toUnicodeRef = context.register(cmapStream);

            widthsObjRef = context.register(context.obj(LIBERATION_SANS_WINANSI_WIDTHS));

            var fontDesc = context.obj({
                Type: 'FontDescriptor',
                FontName: PDFLib.PDFName.of('LiberationSans'),
                Flags: PDFLib.PDFNumber.of(32),
                FontBBox: [-544, -303, 1302, 980],
                ItalicAngle: PDFLib.PDFNumber.of(0),
                Ascent: PDFLib.PDFNumber.of(905),
                Descent: PDFLib.PDFNumber.of(-212),
                CapHeight: PDFLib.PDFNumber.of(688),
                StemV: PDFLib.PDFNumber.of(80),
                FontFile2: fontFileRef
            });
            fontDescRef = context.register(fontDesc);

            var sharedFontObj = context.obj({
                Type: 'Font',
                Subtype: 'TrueType',
                BaseFont: PDFLib.PDFName.of('LiberationSans'),
                Encoding: PDFLib.PDFName.of('WinAnsiEncoding'),
                FirstChar: PDFLib.PDFNumber.of(32),
                LastChar: PDFLib.PDFNumber.of(255),
                Widths: widthsObjRef,
                FontDescriptor: fontDescRef,
                ToUnicode: toUnicodeRef
            });
            sharedFontDictRef = context.register(sharedFontObj);
        }

        ensureSharedFontObjects();

        function buildLiberationSansWidthsForRange(firstChar, lastChar) {
            var arr = [];
            for (var c = firstChar; c <= lastChar; c++) {
                if (c >= 32 && c <= 255) {
                    arr.push(LIBERATION_SANS_WINANSI_WIDTHS[c - 32] || 556);
                } else {
                    arr.push(556);
                }
            }
            return arr;
        }

        var indirectObjects = context.enumerateIndirectObjects();
        for (var i = 0; i < indirectObjects.length; i++) {
            var obj = indirectObjects[i][1];
            if (!obj || typeof obj.get !== 'function') continue;

            var subtypeName = String(obj.get(PDFLib.PDFName.of('Subtype')) || '');

            // 1. CIDFontType2 / CIDFontType0: ensure CIDToGIDMap /Identity, embedded FontFile2 & remove partial /CIDSet (Matterhorn 21-004)
            if (subtypeName === '/CIDFontType2' || subtypeName === '/CIDFontType0') {
                if (subtypeName === '/CIDFontType0') {
                    obj.set(PDFLib.PDFName.of('Subtype'), PDFLib.PDFName.of('CIDFontType2'));
                }
                if (!obj.get(PDFLib.PDFName.of('CIDToGIDMap'))) {
                    obj.set(PDFLib.PDFName.of('CIDToGIDMap'), PDFLib.PDFName.of('Identity'));
                }
                var cidDesc = obj.lookup ? obj.lookup(PDFLib.PDFName.of('FontDescriptor')) : null;
                if (cidDesc && typeof cidDesc.get === 'function') {
                    if (typeof cidDesc.delete === 'function') {
                        cidDesc.delete(PDFLib.PDFName.of('CIDSet'));
                    }
                    if (!cidDesc.get(PDFLib.PDFName.of('FontFile')) &&
                        !cidDesc.get(PDFLib.PDFName.of('FontFile2')) &&
                        !cidDesc.get(PDFLib.PDFName.of('FontFile3'))) {
                        cidDesc.set(PDFLib.PDFName.of('FontFile2'), fontFileRef);
                    }
                } else {
                    obj.set(PDFLib.PDFName.of('FontDescriptor'), fontDescRef);
                }
                continue;
            }

            // 2. Type0 Composite Font: ensure /ToUnicode is present
            if (subtypeName === '/Type0') {
                if (!obj.get(PDFLib.PDFName.of('ToUnicode'))) {
                    obj.set(PDFLib.PDFName.of('ToUnicode'), toUnicodeRef);
                }
                continue;
            }

            // 3. Simple Font (/Type1, /TrueType, /MMType1)
            var isSimpleFont = subtypeName === '/Type1' || subtypeName === '/TrueType' || subtypeName === '/MMType1';
            if (!isSimpleFont) continue;

            var encObj = obj.lookup ? obj.lookup(PDFLib.PDFName.of('Encoding')) : obj.get(PDFLib.PDFName.of('Encoding'));
            var diffArr = (encObj && typeof encObj.get === 'function') ? encObj.get(PDFLib.PDFName.of('Differences')) : null;
            var hasCustomDifferences = Boolean(diffArr);

            var existingDesc = obj.lookup ? obj.lookup(PDFLib.PDFName.of('FontDescriptor')) : null;
            if (existingDesc && typeof existingDesc.delete === 'function') {
                existingDesc.delete(PDFLib.PDFName.of('CIDSet'));
            }
            var hasEmbeddedFontFile = Boolean(
                existingDesc && typeof existingDesc.get === 'function' && (
                    existingDesc.get(PDFLib.PDFName.of('FontFile')) ||
                    existingDesc.get(PDFLib.PDFName.of('FontFile2')) ||
                    existingDesc.get(PDFLib.PDFName.of('FontFile3'))
                )
            );

            if (!existingDesc) {
                obj.set(PDFLib.PDFName.of('Type'), PDFLib.PDFName.of('Font'));
                obj.set(PDFLib.PDFName.of('Subtype'), PDFLib.PDFName.of('TrueType'));
                obj.set(PDFLib.PDFName.of('BaseFont'), PDFLib.PDFName.of('LiberationSans'));
                if (!hasCustomDifferences) {
                    obj.set(PDFLib.PDFName.of('Encoding'), PDFLib.PDFName.of('WinAnsiEncoding'));
                }
                obj.set(PDFLib.PDFName.of('FirstChar'), PDFLib.PDFNumber.of(32));
                obj.set(PDFLib.PDFName.of('LastChar'), PDFLib.PDFNumber.of(255));
                obj.set(PDFLib.PDFName.of('Widths'), widthsObjRef);
                obj.set(PDFLib.PDFName.of('FontDescriptor'), fontDescRef);
            } else if (!hasEmbeddedFontFile) {
                // Synchronize FontDescriptor metrics + /Widths 1:1 with embedded LiberationSans (Matterhorn 21-006)
                obj.set(PDFLib.PDFName.of('Subtype'), PDFLib.PDFName.of('TrueType'));
                obj.set(PDFLib.PDFName.of('BaseFont'), PDFLib.PDFName.of('LiberationSans'));
                if (!hasCustomDifferences && !obj.get(PDFLib.PDFName.of('Encoding'))) {
                    obj.set(PDFLib.PDFName.of('Encoding'), PDFLib.PDFName.of('WinAnsiEncoding'));
                }
                existingDesc.set(PDFLib.PDFName.of('FontName'), PDFLib.PDFName.of('LiberationSans'));
                existingDesc.set(PDFLib.PDFName.of('Flags'), PDFLib.PDFNumber.of(32));
                existingDesc.set(PDFLib.PDFName.of('FontBBox'), context.obj([-544, -303, 1302, 980]));
                existingDesc.set(PDFLib.PDFName.of('ItalicAngle'), PDFLib.PDFNumber.of(0));
                existingDesc.set(PDFLib.PDFName.of('Ascent'), PDFLib.PDFNumber.of(905));
                existingDesc.set(PDFLib.PDFName.of('Descent'), PDFLib.PDFNumber.of(-212));
                existingDesc.set(PDFLib.PDFName.of('CapHeight'), PDFLib.PDFNumber.of(688));
                existingDesc.set(PDFLib.PDFName.of('StemV'), PDFLib.PDFNumber.of(80));
                existingDesc.set(PDFLib.PDFName.of('FontFile2'), fontFileRef);

                var fcValObj = obj.lookup ? obj.lookup(PDFLib.PDFName.of('FirstChar')) : obj.get(PDFLib.PDFName.of('FirstChar'));
                var lcValObj = obj.lookup ? obj.lookup(PDFLib.PDFName.of('LastChar')) : obj.get(PDFLib.PDFName.of('LastChar'));
                var fcInt = fcValObj ? parseInt(String(fcValObj), 10) : 32;
                var lcInt = lcValObj ? parseInt(String(lcValObj), 10) : 255;
                if (isNaN(fcInt) || isNaN(lcInt) || lcInt < fcInt || (fcInt === 32 && lcInt === 255)) {
                    obj.set(PDFLib.PDFName.of('FirstChar'), PDFLib.PDFNumber.of(32));
                    obj.set(PDFLib.PDFName.of('LastChar'), PDFLib.PDFNumber.of(255));
                    obj.set(PDFLib.PDFName.of('Widths'), widthsObjRef);
                } else {
                    var customRangeWidths = buildLiberationSansWidthsForRange(fcInt, lcInt);
                    obj.set(PDFLib.PDFName.of('Widths'), context.register(context.obj(customRangeWidths)));
                }
            } else {
                // Already embedded font: ensure /FirstChar, /LastChar & /Widths array length match (Matterhorn 21-006)
                var eFcObj = obj.lookup ? obj.lookup(PDFLib.PDFName.of('FirstChar')) : obj.get(PDFLib.PDFName.of('FirstChar'));
                var eLcObj = obj.lookup ? obj.lookup(PDFLib.PDFName.of('LastChar')) : obj.get(PDFLib.PDFName.of('LastChar'));
                var eWObj = obj.lookup ? obj.lookup(PDFLib.PDFName.of('Widths')) : obj.get(PDFLib.PDFName.of('Widths'));
                if (!eFcObj || !eLcObj || !eWObj) {
                    obj.set(PDFLib.PDFName.of('FirstChar'), PDFLib.PDFNumber.of(32));
                    obj.set(PDFLib.PDFName.of('LastChar'), PDFLib.PDFNumber.of(255));
                    obj.set(PDFLib.PDFName.of('Widths'), widthsObjRef);
                } else if (typeof eWObj.size === 'function') {
                    var eFc = parseInt(String(eFcObj), 10);
                    var eLc = parseInt(String(eLcObj), 10);
                    if (!isNaN(eFc) && !isNaN(eLc) && eLc >= eFc && eWObj.size() !== (eLc - eFc + 1)) {
                        var repairedWidths = buildLiberationSansWidthsForRange(eFc, eLc);
                        obj.set(PDFLib.PDFName.of('Widths'), context.register(context.obj(repairedWidths)));
                    }
                }
            }

            if (!obj.get(PDFLib.PDFName.of('ToUnicode'))) {
                if (hasCustomDifferences) {
                    var customCmapBytes = stringToLatin1Bytes(buildCustomDifferencesToUnicodeCMapString(diffArr, context));
                    var customCmapRef = context.register(context.flateStream(customCmapBytes));
                    obj.set(PDFLib.PDFName.of('ToUnicode'), customCmapRef);
                } else {
                    obj.set(PDFLib.PDFName.of('ToUnicode'), toUnicodeRef);
                }
            }
        }

        return {
            fontDictRef: sharedFontDictRef,
            toUnicodeRef: toUnicodeRef
        };
    }

    /**
     * 1-Click PDF/UA-1 (ISO 14289-1 / PAC 2026) & WCAG 2.1/2.2 Auto-Remediation:
     * 1. Synchronizes /Info and XMP /Metadata 1:1 (UTF-8 BOM, W5M0MpCehiHzreSzNTczkc9d, pdfuaid:part=1, pdfaExtension)
     * 2. Tokenizes & tags all page Content Streams (<H1>/<H2>/<P> BDC..EMC, intact path/image /Artifact BMC..EMC, WCAG 1.4.3 contrast)
     * 3. Builds complete /StructTreeRoot with /ParentTree Number-Tree, /ParentTreeNextKey, <Link>/<Form> /OBJR & page /StructParents
     * 4. Embeds TrueType Font (/FontFile2 LiberationSans + /Widths + /ToUnicode incl. /Differences) into all unembedded fonts
     */
    async function remediatePdfAccessibility(customDoc, silentBatchMode) {
        var doc = customDoc || getActiveDoc();
        if (!doc) return null;
        if (!silentBatchMode) {
            await bakeAnnotationsIntoDocument(doc);
        }

        // Check if the document is a pure image scan without extractable text (0 characters)
        // If so, automatically run offline Sandwich-OCR (Tesseract) before PDF/UA tagging!
        if (!silentBatchMode) {
            try {
                var preCheckJsDoc = await loadPdfJsDocument(doc.bytes);
                var preScanPages = Math.min(preCheckJsDoc.numPages, 15);
                var existingTextChars = 0;
                for (var sp = 1; sp <= preScanPages; sp++) {
                    var spPage = await preCheckJsDoc.getPage(sp);
                    var spTc = await spPage.getTextContent();
                    var spTxt = spTc.items.map(function (it) { return it.str; }).join('').trim();
                    existingTextChars += spTxt.length;
                    if (existingTextChars > 0) break;
                }
                if (existingTextChars === 0 && window.Tesseract) {
                    var progBox = document.getElementById('a11yAuditProgressBox');
                    var progLabel = document.getElementById('a11yAuditStepLabel');
                    var progPct = document.getElementById('a11yAuditStepPercent');
                    var progFill = document.getElementById('a11yAuditProgressFill');
                    if (progBox) {
                        progBox.style.display = 'block';
                        if (progFill) progFill.style.width = '25%';
                        if (progPct) progPct.textContent = 'OCR…';
                        if (progLabel) {
                            progLabel.textContent = '🔎 Reiner Bild-Scan erkannt — führe automatisch Offline-OCR (Texterkennung) für alle Seiten durch…';
                        }
                    }
                    showToast('Reiner Bild-Scan erkannt: Starte automatische Offline-Texterkennung (Sandwich-OCR)…', 'info');
                    var scopeEl = document.getElementById('ocrScope');
                    var prevScope = scopeEl ? scopeEl.value : 'all';
                    if (scopeEl) scopeEl.value = 'all';
                    await convertToSearchableSandwichPdf();
                    if (scopeEl) scopeEl.value = prevScope;
                }
            } catch (ocrPreErr) {
                console.warn('Auto-OCR pre-check warning:', ocrPreErr);
            }
        }

        var fixTitle = silentBatchMode ? '' : ((document.getElementById('a11yFixTitle') && document.getElementById('a11yFixTitle').value) || '').trim();
        if (!fixTitle || /\.pdf$/i.test(fixTitle)) {
            fixTitle = doc.name.replace(/\.pdf$/i, '').replace(/_/g, ' ') + ' - Barrierefreies Dokument';
            if (!silentBatchMode && document.getElementById('a11yFixTitle')) {
                document.getElementById('a11yFixTitle').value = fixTitle;
            }
        }
        var fixLang = (document.getElementById('a11yFixLang') && document.getElementById('a11yFixLang').value) || 'de-DE';

        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true, updateMetadata: false });
        var context = pdfDoc.context;
        var catalog = pdfDoc.catalog;
        var pages = pdfDoc.getPages();

        var fixAuthor = (pdfDoc.getAuthor() || '').trim() || 'PDF-Werkstatt Pro';
        var fixSubject = (pdfDoc.getSubject() || '').trim() || 'Barrierefreies PDF-Dokument (PDF/UA-1 & WCAG 2.1)';
        var appVer = window.PDFSTUDIO_VERSION || '1.1.0';
        var fixCreator = 'PDF-Werkstatt Pro v' + appVer;
        var fixProducer = 'PDF-Werkstatt Pro v' + appVer + ' PDF/UA-1 Engine';
        var nowSec = new Date(Math.floor(Date.now() / 1000) * 1000);
        var isoDateStr = nowSec.toISOString().replace(/\.\d{3}Z$/, 'Z');

        // 0. Purge any pre-existing /StructElem & /StructTreeRoot objects (e.g. old <Figure> elements without /Alt),
        //    remove stray non-Catalog /Metadata keys & clean nested BDC/EMC inside Form XObjects (/Subtype /Form)
        if (typeof catalog.delete === 'function') {
            catalog.delete(PDFLib.PDFName.of('StructTreeRoot'));
        }
        var allIndirect = context.enumerateIndirectObjects();
        for (var ioIdx = 0; ioIdx < allIndirect.length; ioIdx++) {
            var ioRef = allIndirect[ioIdx][0];
            var ioObj = allIndirect[ioIdx][1];
            if (!ioObj) continue;
            var ioDict = ioObj.dict ? ioObj.dict : (typeof ioObj.get === 'function' ? ioObj : null);
            if (!ioDict || typeof ioDict.get !== 'function') continue;

            var ioType = String(ioDict.get(PDFLib.PDFName.of('Type')) || '');
            var ioSubtype = String(ioDict.get(PDFLib.PDFName.of('Subtype')) || '');
            var ioStructS = String(ioDict.get(PDFLib.PDFName.of('S')) || '');

            // Delete old structure tree elements so no orphaned <Figure> without /Alt remains in the PDF
            if (ioType === '/StructElem' || ioType === '/StructTreeRoot' || (ioStructS && !ioSubtype && ioDict.get(PDFLib.PDFName.of('P')))) {
                if (typeof context.delete === 'function') {
                    context.delete(ioRef);
                }
                continue;
            }

            if (ioDict !== catalog && ioDict.get(PDFLib.PDFName.of('Metadata'))) {
                if (typeof ioDict.delete === 'function') {
                    ioDict.delete(PDFLib.PDFName.of('Metadata'));
                }
            }

            if (ioType !== '/Page' && typeof ioDict.delete === 'function') {
                if (ioDict.get(PDFLib.PDFName.of('StructParents'))) {
                    ioDict.delete(PDFLib.PDFName.of('StructParents'));
                }
                if (ioSubtype !== '/Link' && ioSubtype !== '/Widget' && ioDict.get(PDFLib.PDFName.of('StructParent'))) {
                    ioDict.delete(PDFLib.PDFName.of('StructParent'));
                }
            }

            if (ioSubtype === '/Form' && (ioObj instanceof PDFLib.PDFRawStream || ioObj.contents)) {
                var formSrc = decodeRawPdfStreamToString(ioObj);
                if (formSrc && (formSrc.indexOf('BDC') !== -1 || formSrc.indexOf('BMC') !== -1 || formSrc.indexOf('EMC') !== -1)) {
                    var formStmts = parsePdfContentStreamStatements(formSrc);
                    var cleanFormLines = [];
                    for (var fs = 0; fs < formStmts.length; fs++) {
                        var fOp = formStmts[fs].op;
                        if (fOp === 'BMC' || fOp === 'BDC' || fOp === 'EMC' || fOp === 'MP' || fOp === 'DP') continue;
                        cleanFormLines.push(formStmts[fs].raw);
                    }
                    var newFormBytes = stringToLatin1Bytes(cleanFormLines.join('\n') + '\n');
                    var newFormStream = context.flateStream(newFormBytes);
                    var fEntries = ioDict.entries ? ioDict.entries() : [];
                    for (var fe = 0; fe < fEntries.length; fe++) {
                        var kName = String(fEntries[fe][0]).replace(/^\//, '');
                        if (kName !== 'Length' && kName !== 'Filter' && kName !== 'DecodeParms') {
                            newFormStream.dict.set(fEntries[fe][0], fEntries[fe][1]);
                        }
                    }
                    context.assign(ioRef, newFormStream);
                }
            }
        }

        // 0b. Pre-scan untouched original PDF (doc.bytes) with original fonts & glyph widths BEFORE font replacement
        //     so every email address (mailto:) and URL (https://, http://, www.) is reliably detected with exact [x1,y1,x2,y2]
        var linkTokenRegex = /((?:mailto:\s*)?[a-zA-Z0-9äöüÄÖÜß._%+\-]+(?:\s*\.\s*[a-zA-Z0-9äöüÄÖÜß._%+\-]+)*\s*@\s*[a-zA-Z0-9äöüÄÖÜß\-]+(?:\s*\.\s*[a-zA-Z0-9äöüÄÖÜß\-]+)*\s*\.\s*[a-zA-Z]{2,24}|https?:\/\/[^\s<>()"']+|www\.[a-zA-Z0-9äöüÄÖÜß.\-]+\.[a-zA-Z]{2,24}[^\s<>()"']*)/gi;

        function parseLinkTokenMatch(rawCandidate) {
            var cleaned = String(rawCandidate || '').replace(/[\u00AD\u200B\uFEFF]/g, '').replace(/[.,;:!?)\]>]+$/, '').replace(/^[([<]+/, '').trim();
            if (cleaned.length < 5) return null;
            var isEmail = cleaned.indexOf('@') !== -1 && !/^https?:\/\//i.test(cleaned);
            var compact = isEmail ? cleaned.replace(/\s+/g, '') : cleaned;
            var targetUri = isEmail
                ? ('mailto:' + compact.replace(/^mailto:/i, ''))
                : (/^https?:\/\//i.test(compact) ? compact : ('https://' + compact));
            var normKey = compact.toLowerCase().replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
            return {
                rawText: compact,
                uri: targetUri,
                normKey: normKey,
                isEmail: isEmail
            };
        }

        function rectsOverlapOrClose(rA, rB) {
            if (!rA || !rB || rA.length < 4 || rB.length < 4) return false;
            var ax1 = Math.min(rA[0], rA[2]), ax2 = Math.max(rA[0], rA[2]);
            var ay1 = Math.min(rA[1], rA[3]), ay2 = Math.max(rA[1], rA[3]);
            var bx1 = Math.min(rB[0], rB[2]), bx2 = Math.max(rB[0], rB[2]);
            var by1 = Math.min(rB[1], rB[3]), by2 = Math.max(rB[1], rB[3]);
            var overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1);
            var overlapY = Math.min(ay2, by2) - Math.max(ay1, by1);
            return overlapX >= -10 && overlapY >= -7;
        }

        function extractLinksFromTextRuns(runsList) {
            var found = [];
            var seenOnPage = {};
            var lines = [];
            for (var rIdx = 0; rIdx < runsList.length; rIdx++) {
                var r = runsList[rIdx];
                var bestLine = null;
                for (var lSearch = 0; lSearch < lines.length; lSearch++) {
                    var candL = lines[lSearch];
                    var tolY = Math.max(candL.fontH, r.fontH) * 0.5;
                    if (Math.abs(r.baseY - candL.baseY) <= tolY) {
                        bestLine = candL;
                        break;
                    }
                }
                if (bestLine) {
                    bestLine.runs.push(r);
                    bestLine.minX = Math.min(bestLine.minX, r.x1);
                    bestLine.maxX = Math.max(bestLine.maxX, r.x2);
                } else {
                    lines.push({
                        baseY: r.baseY,
                        fontH: r.fontH,
                        minX: r.x1,
                        maxX: r.x2,
                        runs: [r]
                    });
                }
            }

            for (var lIdx = 0; lIdx < lines.length; lIdx++) {
                var lnRuns = lines[lIdx].runs.slice().sort(function (a, b) { return a.x1 - b.x1; });
                var gapThresholds = [0.32, 0.9];
                for (var gtIdx = 0; gtIdx < gapThresholds.length; gtIdx++) {
                    var gapFactor = gapThresholds[gtIdx];
                    var lineChars = [];
                    var charToRunIdx = [];
                    var charToRelRatio = [];
                    for (var kr = 0; kr < lnRuns.length; kr++) {
                        var curR = lnRuns[kr];
                        if (kr > 0) {
                            var prevR = lnRuns[kr - 1];
                            var gapX = curR.x1 - prevR.x2;
                            var prevEndsConnector = /[\s@/:.\-_]$/.test(prevR.str);
                            var curStartsConnector = /^[\s@/:.\-_]/.test(curR.str);
                            if (gapX > curR.fontH * gapFactor && !prevEndsConnector && !curStartsConnector) {
                                lineChars.push(' ');
                                charToRunIdx.push(kr - 1);
                                charToRelRatio.push(1);
                            }
                        }
                        var rLen = curR.str.length;
                        for (var chIdx = 0; chIdx < rLen; chIdx++) {
                            lineChars.push(curR.str.charAt(chIdx));
                            charToRunIdx.push(kr);
                            charToRelRatio.push(rLen > 0 ? (chIdx / rLen) : 0);
                        }
                    }
                    var lineStr = lineChars.join('');
                    linkTokenRegex.lastIndex = 0;
                    var mTok;
                    while ((mTok = linkTokenRegex.exec(lineStr)) !== null) {
                        var parsed = parseLinkTokenMatch(mTok[0]);
                        if (!parsed) continue;
                        var mStart = mTok.index;
                        var mEnd = mStart + mTok[0].replace(/[.,;:!?)\]>]+$/, '').length;
                        var matchedMcids = [];
                        var seenM = {};
                        var minX1 = Infinity, minY1 = Infinity, maxX2 = -Infinity, maxY2 = -Infinity;
                        for (var ci = mStart; ci < mEnd && ci < charToRunIdx.length; ci++) {
                            var rIndex = charToRunIdx[ci];
                            var runRef = lnRuns[rIndex];
                            if (!runRef) continue;
                            if (runRef.mcid !== null && runRef.mcid !== undefined && !seenM[runRef.mcid]) {
                                seenM[runRef.mcid] = true;
                                matchedMcids.push(runRef.mcid);
                            }
                            var cRatio = charToRelRatio[ci] || 0;
                            var rW = Math.max(4, runRef.x2 - runRef.x1);
                            var charW = rW / Math.max(1, runRef.str.length);
                            var cx1 = runRef.x1 + rW * cRatio;
                            var cx2 = cx1 + charW;
                            if (cx1 < minX1) minX1 = cx1;
                            if (runRef.y1 < minY1) minY1 = runRef.y1;
                            if (cx2 > maxX2) maxX2 = cx2;
                            if (runRef.y2 > maxY2) maxY2 = runRef.y2;
                        }
                        if (!isFinite(minX1)) {
                            minX1 = lnRuns[0].x1;
                            minY1 = lnRuns[0].y1;
                            maxX2 = lnRuns[lnRuns.length - 1].x2;
                            maxY2 = lnRuns[lnRuns.length - 1].y2;
                        }
                        var dedupKey = parsed.normKey + '|' + Math.round(lines[lIdx].baseY);
                        if (seenOnPage[dedupKey]) {
                            var prevEntry = seenOnPage[dedupKey];
                            for (var pm = 0; pm < matchedMcids.length; pm++) {
                                if (prevEntry.mcids.indexOf(matchedMcids[pm]) === -1) {
                                    prevEntry.mcids.push(matchedMcids[pm]);
                                }
                            }
                            continue;
                        }
                        var linkEntry = {
                            rawText: parsed.rawText,
                            uri: parsed.uri,
                            normKey: parsed.normKey,
                            isEmail: parsed.isEmail,
                            mcids: matchedMcids,
                            baseY: lines[lIdx].baseY,
                            fontH: lines[lIdx].fontH,
                            rect: [
                                Math.round(minX1 * 100) / 100,
                                Math.round(minY1 * 100) / 100,
                                Math.round(Math.max(minX1 + 18, maxX2) * 100) / 100,
                                Math.round(maxY2 * 100) / 100
                            ]
                        };
                        seenOnPage[dedupKey] = linkEntry;
                        found.push(linkEntry);
                    }
                }
            }
            return found;
        }

        var origLinksByPage = {};
        try {
            var origJsDoc = await loadPdfJsDocument(doc.bytes);
            if (origJsDoc) {
                for (var op = 1; op <= origJsDoc.numPages; op++) {
                    var origPage = await origJsDoc.getPage(op);
                    var origTc = await origPage.getTextContent();
                    var origRuns = [];
                    for (var oti = 0; oti < origTc.items.length; oti++) {
                        var oItem = origTc.items[oti];
                        if (!oItem || typeof oItem.str !== 'string') continue;
                        var oStr = oItem.str.replace(/[\u00AD\u200B\uFEFF]/g, '');
                        if (!oStr) continue;
                        var oTr = oItem.transform || [10, 0, 0, 10, 72, 700];
                        var oFontH = Math.max(
                            Math.sqrt(oTr[0] * oTr[0] + oTr[1] * oTr[1]),
                            Math.sqrt(oTr[2] * oTr[2] + oTr[3] * oTr[3]),
                            oItem.height || 0
                        ) || 11;
                        if (oFontH < 0.5 || oStr.indexOf('Verknuepfung:') === 0) continue;
                        var fh = Math.max(8, oFontH);
                        var iw = Math.max(4, oItem.width || (oStr.length * fh * 0.52));
                        origRuns.push({
                            mcid: null,
                            str: oStr,
                            x1: oTr[4],
                            y1: oTr[5] - fh * 0.22,
                            x2: oTr[4] + iw,
                            y2: oTr[5] + fh * 0.92,
                            baseY: oTr[5],
                            fontH: fh
                        });
                    }
                    origLinksByPage[op - 1] = extractLinksFromTextRuns(origRuns);
                }
            }
        } catch (origScanErr) {
            console.warn('Pre-scan original PDF warning:', origScanErr);
        }

        // 1. Clean & Synchronize /Info Dictionary 1:1 with XMP
        var infoDict = pdfDoc.getInfoDict();
        if (infoDict && infoDict.dict && typeof infoDict.dict.clear === 'function') {
            infoDict.dict.clear();
        }
        pdfDoc.setTitle(fixTitle);
        pdfDoc.setAuthor(fixAuthor);
        pdfDoc.setSubject(fixSubject);
        pdfDoc.setCreator(fixCreator);
        pdfDoc.setProducer(fixProducer);
        pdfDoc.setCreationDate(nowSec);
        pdfDoc.setModificationDate(nowSec);

        // 2. Set /Lang, /ViewerPreferences & /MarkInfo on Catalog (with Suspects: false per Matterhorn 01-002)
        catalog.set(PDFLib.PDFName.of('Lang'), PDFLib.PDFString.of(fixLang));
        catalog.set(PDFLib.PDFName.of('ViewerPreferences'), context.obj({ DisplayDocTitle: true }));
        catalog.set(PDFLib.PDFName.of('MarkInfo'), context.obj({ Marked: true, Suspects: false }));

        // 3. Embed TrueType Fonts (/FontFile2 + /Widths + /ToUnicode) for all unembedded Fonts
        var sharedFontInfo = await embedPdfUaFontsIntoDocument(pdfDoc);

        // 4. Tag all Page Content Streams (<H1>/<H2>/<P>/<Link> MCID, non-text -> /Artifact),
        //    match every email/URL in text to its exact MCID(s), and build /StructTreeRoot + /ParentTree
        var pageTagStates = [];

        // 4a. Pass 1: Tokenize & tag all page content streams with sequential MCIDs (0 .. pageMcidCount - 1)
        for (var i = 0; i < pages.length; i++) {
            var page = pages[i];
            var pageNode = page.node;

            // Detect and upgrade any low-opacity ExtGState (ca: 0.005 from older Sandwich-OCR runs) to 3 Tr invisible mode
            var hadLowOpacityOcrGState = false;
            var resDict = pageNode.Resources ? pageNode.Resources() : pageNode.lookup(PDFLib.PDFName.of('Resources'));
            if (resDict && resDict.lookup) {
                var extGStateDict = resDict.lookup(PDFLib.PDFName.of('ExtGState'));
                if (extGStateDict && extGStateDict.entries) {
                    var gsEntries = extGStateDict.entries();
                    for (var g = 0; g < gsEntries.length; g++) {
                        var gsObj = context.lookup(gsEntries[g][1]);
                        if (gsObj && gsObj.get) {
                            var caVal = gsObj.get(PDFLib.PDFName.of('ca'));
                            if (caVal && parseFloat(String(caVal)) > 0 && parseFloat(String(caVal)) < 0.05) {
                                gsObj.set(PDFLib.PDFName.of('ca'), PDFLib.PDFNumber.of(1));
                                gsObj.set(PDFLib.PDFName.of('CA'), PDFLib.PDFNumber.of(1));
                                hadLowOpacityOcrGState = true;
                            }
                        }
                    }
                }
            }

            // Decode and combine all content streams on this page
            var contentsObj = pageNode.get(PDFLib.PDFName.of('Contents'));
            var streamRefs = [];
            if (contentsObj) {
                var lookedUpContents = context.lookup(contentsObj);
                if (lookedUpContents && typeof lookedUpContents.asArray === 'function') {
                    streamRefs = lookedUpContents.asArray();
                } else {
                    streamRefs = [contentsObj];
                }
            }

            var pageMcidCount = 0;
            var pageMcidTags = [];
            var pageMcidRawTexts = [];
            var taggedContentStr = '';
            if (streamRefs.length > 0 && PDFLib.decodePDFRawStream) {
                var decodedParts = [];
                for (var s = 0; s < streamRefs.length; s++) {
                    var rawStream = context.lookup(streamRefs[s]);
                    var decPart = decodeRawPdfStreamToString(rawStream);
                    if (decPart) decodedParts.push(decPart);
                }

                if (decodedParts.length > 0) {
                    var combinedSrc = decodedParts.join('\n')
                        .replace(/(?:\/(?:Link|Form|Annot)\s*<<\/MCID\s+\d+>>\s*BDC\s*)?q\s+BT\s+\/F_PDFUA\s+0\.01\s+Tf[\s\S]*?ET\s+Q(?:\s*EMC)?\s*/g, '');
                    var stmts = parsePdfContentStreamStatements(combinedSrc);
                    var taggedResult = tagContentStreamStatementsForPdfUa(stmts, 0, hadLowOpacityOcrGState, i);
                    pageMcidCount = taggedResult.nextMcid;
                    pageMcidTags = taggedResult.mcidTags;
                    pageMcidRawTexts = taggedResult.mcidRawTexts || [];
                    taggedContentStr = taggedResult.contentString;
                }
            }

            // Ensure embedded TrueType font /F_PDFUA is always registered in page /Resources /Font
            if (sharedFontInfo && sharedFontInfo.fontDictRef) {
                if (!resDict) {
                    resDict = context.obj({});
                    pageNode.set(PDFLib.PDFName.of('Resources'), resDict);
                }
                var fontResDict = resDict.lookup ? resDict.lookup(PDFLib.PDFName.of('Font')) : null;
                if (!fontResDict || typeof fontResDict.set !== 'function') {
                    fontResDict = context.obj({});
                    resDict.set(PDFLib.PDFName.of('Font'), fontResDict);
                }
                fontResDict.set(PDFLib.PDFName.of('F_PDFUA'), sharedFontInfo.fontDictRef);
            }

            // If a page has no text operators (e.g. cover image / graphic page), inject an invisible 3 Tr
            // accessible text marker using the embedded LiberationSans font so every page is screenreader-searchable
            if (pageMcidCount === 0 && sharedFontInfo && sharedFontInfo.fontDictRef) {
                var fallbackTag = i === 0 ? 'H1' : 'H2';
                taggedContentStr +=
                    '/' + fallbackTag + ' <</MCID 0>> BDC\n' +
                    'BT\n' +
                    '/F_PDFUA 1 Tf\n' +
                    '3 Tr\n' +
                    '0 0 Td\n' +
                    '(' + (i === 0 ? fixTitle.replace(/[()\\]/g, ' ') : ('Abschnitt Seite ' + (i + 1))) + ') Tj\n' +
                    'ET\n' +
                    'EMC\n';
                pageMcidCount = 1;
                pageMcidTags = [fallbackTag];
                pageMcidRawTexts = [''];
            }

            var contentStreamRef = null;
            if (taggedContentStr.length > 0) {
                var prelimStreamBytes = stringToLatin1Bytes(taggedContentStr);
                var prelimFlateStream = context.flateStream(prelimStreamBytes);
                contentStreamRef = context.register(prelimFlateStream);
                pageNode.set(PDFLib.PDFName.of('Contents'), contentStreamRef);
            }

            pageTagStates.push({
                pageMcidCount: pageMcidCount,
                pageMcidTags: pageMcidTags,
                pageMcidRawTexts: pageMcidRawTexts,
                taggedContentStr: taggedContentStr,
                contentStreamRef: contentStreamRef
            });
        }

        // 4b. Pass 2: Extract decoded Unicode text, coordinates & exact MCIDs via PDF.js (includeMarkedContent: true)
        var autoLinkItemsByPage = {};
        var pageTextRunsByPage = {};
        var extractedPageHeadings = {};
        var totalAutoLinkedCount = 0;

        try {
            var prelimPdfBytes = await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false, addDefaultPage: false });
            var linkScanJsDoc = await loadPdfJsDocument(prelimPdfBytes);
            for (var lp = 1; lp <= linkScanJsDoc.numPages; lp++) {
                var pIdx0 = lp - 1;
                var jsPage = await linkScanJsDoc.getPage(lp);
                var jsTc = await jsPage.getTextContent({ includeMarkedContent: true });
                var mcidStack = [];
                var bdcSeqCounter = 0;
                var textRuns = [];
                var mcidRunsMap = {};
                var mcidHasNonWs = {};
                var anyMcidDecoded = false;
                var firstLineCandidate = '';

                for (var ti = 0; ti < jsTc.items.length; ti++) {
                    var tItem = jsTc.items[ti];
                    if (!tItem) continue;
                    if (tItem.type === 'beginMarkedContentProps') {
                        var idMatch = tItem.id ? String(tItem.id).match(/_mc(\d+)$/) : null;
                        var parsedMcid = idMatch ? parseInt(idMatch[1], 10) : bdcSeqCounter;
                        bdcSeqCounter++;
                        mcidStack.push(parsedMcid);
                        continue;
                    }
                    if (tItem.type === 'beginMarkedContent') {
                        mcidStack.push(null);
                        continue;
                    }
                    if (tItem.type === 'endMarkedContent') {
                        if (mcidStack.length > 0) mcidStack.pop();
                        continue;
                    }
                    var curMcid = null;
                    for (var ms = mcidStack.length - 1; ms >= 0; ms--) {
                        if (mcidStack[ms] !== null && mcidStack[ms] !== undefined) {
                            curMcid = mcidStack[ms];
                            break;
                        }
                    }
                    var tStr = (typeof tItem.str === 'string') ? tItem.str.replace(/[\u00AD\u200B\uFEFF]/g, '') : '';
                    if (curMcid !== null && tStr.replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F\x00-\x20\x7F]+/g, '').length > 0) {
                        mcidHasNonWs[curMcid] = true;
                        anyMcidDecoded = true;
                    }
                    if (!tStr) continue;
                    var rawTr = tItem.transform || [10, 0, 0, 10, 72, 700];
                    var rawFontH = Math.max(
                        Math.sqrt(rawTr[0] * rawTr[0] + rawTr[1] * rawTr[1]),
                        Math.sqrt(rawTr[2] * rawTr[2] + rawTr[3] * rawTr[3]),
                        tItem.height || 0
                    ) || 11;
                    if (rawFontH < 0.5 || tStr.indexOf('Verknuepfung:') === 0) continue;
                    if (!firstLineCandidate && tStr.trim().length >= 3) {
                        firstLineCandidate = tStr.trim().slice(0, 80);
                    }
                    var fontH = Math.max(8, rawFontH);
                    var itemW = Math.max(4, tItem.width || (tStr.length * fontH * 0.52));
                    var rx1 = rawTr[4];
                    var ry1 = rawTr[5] - fontH * 0.22;
                    var rx2 = rx1 + itemW;
                    var ry2 = rawTr[5] + fontH * 0.92;
                    var runObj = {
                        mcid: curMcid,
                        str: tStr,
                        x1: rx1,
                        y1: ry1,
                        x2: rx2,
                        y2: ry2,
                        baseY: rawTr[5],
                        fontH: fontH
                    };
                    textRuns.push(runObj);
                    if (curMcid !== null) {
                        if (!mcidRunsMap[curMcid]) mcidRunsMap[curMcid] = [];
                        mcidRunsMap[curMcid].push(runObj);
                    }
                }

                // Demote any MCID that consists of ONLY whitespace (e.g. CID <0003> space on blank lines)
                // to /Artifact BMC and compact remaining MCIDs (0 .. nextCleanMcid - 1) so PAC never flags
                // "Tagged text consists of only whitespace"
                var pStateForClean = pageTagStates[pIdx0];
                if (pStateForClean && pStateForClean.pageMcidCount > 0 && anyMcidDecoded) {
                    var oldToNewMcid = {};
                    var newMcidTags = [];
                    var newMcidRawTexts = [];
                    var nextCleanMcid = 0;
                    var hadWhitespaceMcid = false;
                    for (var om = 0; om < pStateForClean.pageMcidCount; om++) {
                        if (mcidHasNonWs[om]) {
                            var newM = nextCleanMcid++;
                            oldToNewMcid[om] = newM;
                            var origTag = (pStateForClean.pageMcidTags && pStateForClean.pageMcidTags[om]) || 'P';
                            if (newM === 0 && origTag === 'P') {
                                origTag = pIdx0 === 0 ? 'H1' : 'H2';
                            }
                            newMcidTags.push(origTag);
                            newMcidRawTexts.push((pStateForClean.pageMcidRawTexts && pStateForClean.pageMcidRawTexts[om]) || '');
                        } else {
                            oldToNewMcid[om] = null;
                            hadWhitespaceMcid = true;
                        }
                    }
                    if (hadWhitespaceMcid) {
                        pStateForClean.taggedContentStr = pStateForClean.taggedContentStr.replace(
                            /\/([A-Za-z0-9]+)\s*<<\/MCID\s+(\d+)>>\s*BDC/g,
                            function (fullMatch, oldTag, oldMcidStr) {
                                var oldIdx = parseInt(oldMcidStr, 10);
                                var mappedIdx = oldToNewMcid[oldIdx];
                                if (mappedIdx === null || mappedIdx === undefined) {
                                    return '/Artifact BMC';
                                }
                                var updatedTag = newMcidTags[mappedIdx] || oldTag;
                                return '/' + updatedTag + ' <</MCID ' + mappedIdx + '>> BDC';
                            }
                        );
                        if (nextCleanMcid === 0 && sharedFontInfo && sharedFontInfo.fontDictRef) {
                            var fbTag = pIdx0 === 0 ? 'H1' : 'H2';
                            var safeFbText = (pIdx0 === 0 ? fixTitle.replace(/[()\\]/g, ' ').trim() : '') || ('Abschnitt Seite ' + (pIdx0 + 1));
                            pStateForClean.taggedContentStr +=
                                '\n/' + fbTag + ' <</MCID 0>> BDC\n' +
                                'BT\n' +
                                '/F_PDFUA 1 Tf\n' +
                                '3 Tr\n' +
                                '0 0 Td\n' +
                                '(' + safeFbText + ') Tj\n' +
                                'ET\n' +
                                'EMC\n';
                            nextCleanMcid = 1;
                            newMcidTags = [fbTag];
                            newMcidRawTexts = [safeFbText];
                        }
                        pStateForClean.pageMcidCount = nextCleanMcid;
                        pStateForClean.pageMcidTags = newMcidTags;
                        pStateForClean.pageMcidRawTexts = newMcidRawTexts;

                        var cleanedRuns = [];
                        var cleanedRunsMap = {};
                        for (var cr = 0; cr < textRuns.length; cr++) {
                            var rObj = textRuns[cr];
                            if (rObj.mcid !== null && rObj.mcid !== undefined) {
                                var mappedM = oldToNewMcid[rObj.mcid];
                                if (mappedM === null || mappedM === undefined) continue;
                                rObj.mcid = mappedM;
                                if (!cleanedRunsMap[mappedM]) cleanedRunsMap[mappedM] = [];
                                cleanedRunsMap[mappedM].push(rObj);
                            }
                            cleanedRuns.push(rObj);
                        }
                        textRuns = cleanedRuns;
                        mcidRunsMap = cleanedRunsMap;
                    }
                }

                pageTextRunsByPage[pIdx0] = textRuns;
                if (firstLineCandidate) {
                    extractedPageHeadings[pIdx0] = firstLineCandidate;
                }

                // Pass A: Reconstruct horizontal text lines across the page (both standard & compact kerning)
                var pLinks = extractLinksFromTextRuns(textRuns);
                var mcidAlreadyLinked = {};
                for (var plI = 0; plI < pLinks.length; plI++) {
                    var plItem = pLinks[plI];
                    for (var pmI = 0; pmI < (plItem.mcids || []).length; pmI++) {
                        mcidAlreadyLinked[plItem.mcids[pmI] + '|' + plItem.normKey] = true;
                    }
                }

                // Merge links detected from untouched original PDF (origLinksByPage) before font replacement
                var origPageLinks = origLinksByPage[pIdx0] || [];
                for (var olI = 0; olI < origPageLinks.length; olI++) {
                    var origLk = origPageLinks[olI];
                    var existingMerged = null;
                    for (var exPl = 0; exPl < pLinks.length; exPl++) {
                        if (pLinks[exPl].normKey === origLk.normKey && rectsOverlapOrClose(pLinks[exPl].rect, origLk.rect)) {
                            existingMerged = pLinks[exPl];
                            break;
                        }
                    }
                    if (!existingMerged) {
                        for (var exPl2 = 0; exPl2 < pLinks.length; exPl2++) {
                            if (pLinks[exPl2].normKey === origLk.normKey && Math.abs((pLinks[exPl2].baseY || 0) - (origLk.baseY || 0)) <= 12) {
                                existingMerged = pLinks[exPl2];
                                break;
                            }
                        }
                    }
                    // Map origLk bounding box / baseline to tagged textRuns MCIDs
                    var mappedMcids = [];
                    var seenMapM = {};
                    for (var trI = 0; trI < textRuns.length; trI++) {
                        var trRun = textRuns[trI];
                        if (trRun.mcid === null || trRun.mcid === undefined) continue;
                        if (rectsOverlapOrClose(origLk.rect, [trRun.x1, trRun.y1, trRun.x2, trRun.y2])) {
                            if (!seenMapM[trRun.mcid]) {
                                seenMapM[trRun.mcid] = true;
                                mappedMcids.push(trRun.mcid);
                            }
                        }
                    }
                    if (mappedMcids.length === 0) {
                        for (var trI2 = 0; trI2 < textRuns.length; trI2++) {
                            var trRun2 = textRuns[trI2];
                            if (trRun2.mcid === null || trRun2.mcid === undefined) continue;
                            if (Math.abs(trRun2.baseY - origLk.baseY) <= Math.max(8, trRun2.fontH * 0.85)) {
                                if (!seenMapM[trRun2.mcid]) {
                                    seenMapM[trRun2.mcid] = true;
                                    mappedMcids.push(trRun2.mcid);
                                }
                            }
                        }
                    }
                    if (existingMerged) {
                        // Prefer original untouched bounding box and merge any mapped MCIDs
                        existingMerged.rect = origLk.rect;
                        for (var mmI = 0; mmI < mappedMcids.length; mmI++) {
                            if (existingMerged.mcids.indexOf(mappedMcids[mmI]) === -1) {
                                existingMerged.mcids.push(mappedMcids[mmI]);
                            }
                            mcidAlreadyLinked[mappedMcids[mmI] + '|' + existingMerged.normKey] = true;
                        }
                    } else {
                        for (var mmI2 = 0; mmI2 < mappedMcids.length; mmI2++) {
                            mcidAlreadyLinked[mappedMcids[mmI2] + '|' + origLk.normKey] = true;
                        }
                        pLinks.push({
                            rawText: origLk.rawText,
                            uri: origLk.uri,
                            normKey: origLk.normKey,
                            isEmail: origLk.isEmail,
                            mcids: mappedMcids,
                            baseY: origLk.baseY,
                            fontH: origLk.fontH,
                            rect: origLk.rect
                        });
                    }
                }

                // Pass B & C: Scan per-MCID combined decoded text & raw content stream text for any remaining links
                var pState = pageTagStates[pIdx0];
                var totalM = pState ? pState.pageMcidCount : 0;
                for (var mCheck = 0; mCheck < totalM; mCheck++) {
                    var mRuns = mcidRunsMap[mCheck] || [];
                    var combinedDecodedSpaced = mRuns.map(function (rn) { return rn.str; }).join(' ');
                    var combinedDecodedCompact = mRuns.map(function (rn) { return rn.str; }).join('');
                    var rawFallback = (pState && pState.pageMcidRawTexts && pState.pageMcidRawTexts[mCheck]) ? pState.pageMcidRawTexts[mCheck] : '';
                    var testStrings = [combinedDecodedSpaced, combinedDecodedCompact, rawFallback];
                    for (var tsI = 0; tsI < testStrings.length; tsI++) {
                        var candidateStr = testStrings[tsI];
                        if (!candidateStr) continue;
                        linkTokenRegex.lastIndex = 0;
                        var mSub;
                        while ((mSub = linkTokenRegex.exec(candidateStr)) !== null) {
                            var parsedSub = parseLinkTokenMatch(mSub[0]);
                            if (!parsedSub) continue;
                            var mcidKey = mCheck + '|' + parsedSub.normKey;
                            if (mcidAlreadyLinked[mcidKey]) continue;
                            // Check if this normKey is already in pLinks on the same line
                            var alreadyOnPage = null;
                            for (var apI = 0; apI < pLinks.length; apI++) {
                                if (pLinks[apI].normKey === parsedSub.normKey && (pLinks[apI].mcids.indexOf(mCheck) !== -1 || pLinks[apI].mcids.length === 0)) {
                                    alreadyOnPage = pLinks[apI];
                                    break;
                                }
                            }
                            if (alreadyOnPage) {
                                if (alreadyOnPage.mcids.indexOf(mCheck) === -1) {
                                    alreadyOnPage.mcids.push(mCheck);
                                }
                                mcidAlreadyLinked[mcidKey] = true;
                                continue;
                            }
                            var bx1 = 72, by1 = 700, bx2 = 200, by2 = 712;
                            if (mRuns.length > 0) {
                                bx1 = mRuns[0].x1;
                                by1 = mRuns[0].y1;
                                bx2 = mRuns[mRuns.length - 1].x2;
                                by2 = mRuns[mRuns.length - 1].y2;
                            }
                            pLinks.push({
                                rawText: parsedSub.rawText,
                                uri: parsedSub.uri,
                                normKey: parsedSub.normKey,
                                isEmail: parsedSub.isEmail,
                                mcids: [mCheck],
                                rect: [
                                    Math.round(bx1 * 100) / 100,
                                    Math.round(by1 * 100) / 100,
                                    Math.round(Math.max(bx1 + 20, bx2) * 100) / 100,
                                    Math.round(by2 * 100) / 100
                                ]
                            });
                            mcidAlreadyLinked[mcidKey] = true;
                        }
                    }
                }

                autoLinkItemsByPage[pIdx0] = pLinks;
            }
        } catch (linkScanErr) {
            console.warn('Auto-link MCID scan warning:', linkScanErr);
            // Fallback to origLinksByPage if prelimPdfBytes scan failed for any reason
            autoLinkItemsByPage = origLinksByPage;
        }

        // 4c. Pass 3: Bind every /Link annotation to its exact content stream MCID(s), update /Link BDC tags,
        //             and construct /StructTreeRoot (<Sect> -> <P> -> <Link> [MCID, OBJR]) + /ParentTree
        var structTreeRootRef = context.nextRef();
        var docElemRef = context.nextRef();
        var sectRefs = [];
        var parentTreeEntries = [];
        var nextStructParentKey = pages.length;

        for (var i = 0; i < pages.length; i++) {
            var page = pages[i];
            var pageNode = page.node;
            var pState = pageTagStates[i];
            var initialPageMcidCount = pState.pageMcidCount;
            var pageMcidCount = initialPageMcidCount;
            var pageMcidTags = pState.pageMcidTags;
            var taggedContentStr = pState.taggedContentStr;
            var pageRuns = pageTextRunsByPage[i] || [];

            pageNode.set(PDFLib.PDFName.of('Tabs'), PDFLib.PDFName.of('S'));
            pageNode.set(PDFLib.PDFName.of('StructParents'), PDFLib.PDFNumber.of(i));

            // Collect existing annotations on this page and match them geometrically to detected links
            var existingAnnotsLookup = pageNode.lookup(PDFLib.PDFName.of('Annots'));
            var pageAnnotRefs = [];
            var existingLinkRecords = [];
            var annotBoundMcidsMap = {};

            if (existingAnnotsLookup && typeof existingAnnotsLookup.asArray === 'function') {
                var exArr = existingAnnotsLookup.asArray();
                for (var exIdx = 0; exIdx < exArr.length; exIdx++) {
                    var exRef = exArr[exIdx];
                    pageAnnotRefs.push(exRef);
                    var exDict = context.lookup(exRef);
                    if (exDict && typeof exDict.get === 'function') {
                        var exSubtype = String(exDict.get(PDFLib.PDFName.of('Subtype')) || '');
                        if (exSubtype === '/Link') {
                            var exRectObj = exDict.get(PDFLib.PDFName.of('Rect'));
                            var exRect = [0, 0, 0, 0];
                            if (exRectObj && typeof exRectObj.asArray === 'function' && exRectObj.asArray().length >= 4) {
                                var ra = exRectObj.asArray();
                                exRect = [
                                    parseFloat(String(ra[0])) || 0,
                                    parseFloat(String(ra[1])) || 0,
                                    parseFloat(String(ra[2])) || 0,
                                    parseFloat(String(ra[3])) || 0
                                ];
                            }
                            var exNormUri = '';
                            var exAct = exDict.lookup ? exDict.lookup(PDFLib.PDFName.of('A')) : null;
                            if (exAct && typeof exAct.get === 'function') {
                                var exUriObj = exAct.lookup ? exAct.lookup(PDFLib.PDFName.of('URI')) : exAct.get(PDFLib.PDFName.of('URI'));
                                if (exUriObj) {
                                    var decodedExUri = (typeof exUriObj.decodeText === 'function') ? exUriObj.decodeText() : String(exUriObj);
                                    exNormUri = decodedExUri.replace(/^[(\s]+|[)\s]+$/g, '').toLowerCase()
                                        .replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
                                }
                            }
                            existingLinkRecords.push({
                                refKey: String(exRef),
                                dict: exDict,
                                rect: exRect,
                                normUri: exNormUri,
                                matched: false
                            });
                        }
                    }
                }
            }

            var pageDetectedLinks = autoLinkItemsByPage[i] || [];
            var addedAutoLinks = false;
            for (var dlIdx = 0; dlIdx < pageDetectedLinks.length; dlIdx++) {
                var dlItem = pageDetectedLinks[dlIdx];
                totalAutoLinkedCount++;
                var matchedExRec = null;
                for (var erIdx = 0; erIdx < existingLinkRecords.length; erIdx++) {
                    var candRec = existingLinkRecords[erIdx];
                    if (!candRec.matched && candRec.normUri && candRec.normUri === dlItem.normKey && rectsOverlapOrClose(candRec.rect, dlItem.rect)) {
                        matchedExRec = candRec;
                        break;
                    }
                }
                if (!matchedExRec) {
                    for (var erIdx2 = 0; erIdx2 < existingLinkRecords.length; erIdx2++) {
                        var candRec2 = existingLinkRecords[erIdx2];
                        if (!candRec2.matched && candRec2.normUri && candRec2.normUri === dlItem.normKey) {
                            matchedExRec = candRec2;
                            break;
                        }
                    }
                }
                if (!matchedExRec) {
                    for (var erIdx3b = 0; erIdx3b < existingLinkRecords.length; erIdx3b++) {
                        var candRec3b = existingLinkRecords[erIdx3b];
                        if (!candRec3b.matched && !candRec3b.normUri && rectsOverlapOrClose(candRec3b.rect, dlItem.rect)) {
                            matchedExRec = candRec3b;
                            break;
                        }
                    }
                }
                if (matchedExRec) {
                    matchedExRec.matched = true;
                    // Always ensure existing /Link annotation has a valid /A URI action (e.g. mailto: / https://)
                    matchedExRec.dict.set(PDFLib.PDFName.of('A'), context.obj({
                        Type: 'Action',
                        S: PDFLib.PDFName.of('URI'),
                        URI: PDFLib.PDFString.of(dlItem.uri)
                    }));
                    matchedExRec.normUri = dlItem.normKey;
                    if (!annotBoundMcidsMap[matchedExRec.refKey]) {
                        annotBoundMcidsMap[matchedExRec.refKey] = [];
                    }
                    for (var dm = 0; dm < (dlItem.mcids || []).length; dm++) {
                        annotBoundMcidsMap[matchedExRec.refKey].push(dlItem.mcids[dm]);
                    }
                    continue;
                }

                var linkAltLabel = dlItem.isEmail
                    ? ('E-Mail senden an ' + dlItem.rawText)
                    : ('Webseite öffnen: ' + dlItem.uri);
                var newLinkAnnot = context.obj({
                    Type: 'Annot',
                    Subtype: 'Link',
                    Rect: dlItem.rect,
                    Border: [0, 0, 0],
                    F: PDFLib.PDFNumber.of(4),
                    P: page.ref,
                    Contents: PDFLib.PDFString.of(linkAltLabel),
                    A: context.obj({
                        Type: 'Action',
                        S: PDFLib.PDFName.of('URI'),
                        URI: PDFLib.PDFString.of(dlItem.uri)
                    })
                });
                var newLinkAnnotRef = context.register(newLinkAnnot);
                pageAnnotRefs.push(newLinkAnnotRef);
                annotBoundMcidsMap[String(newLinkAnnotRef)] = (dlItem.mcids || []).slice();
                existingLinkRecords.push({
                    refKey: String(newLinkAnnotRef),
                    dict: newLinkAnnot,
                    rect: dlItem.rect,
                    normUri: dlItem.normKey,
                    matched: true
                });
                addedAutoLinks = true;
            }
            if (addedAutoLinks) {
                pageNode.set(PDFLib.PDFName.of('Annots'), context.obj(pageAnnotRefs));
            }

            // For any /Link annotation that has not yet bound to an MCID, match overlapping or nearest-baseline textRuns
            for (var erIdx3 = 0; erIdx3 < existingLinkRecords.length; erIdx3++) {
                var rec3 = existingLinkRecords[erIdx3];
                var existingBound = annotBoundMcidsMap[rec3.refKey] || [];
                if (existingBound.length === 0 && pageRuns.length > 0) {
                    for (var prI = 0; prI < pageRuns.length; prI++) {
                        var pRun = pageRuns[prI];
                        if (pRun.mcid !== null && pRun.mcid !== undefined && rectsOverlapOrClose(rec3.rect, [pRun.x1, pRun.y1, pRun.x2, pRun.y2])) {
                            existingBound.push(pRun.mcid);
                        }
                    }
                    if (existingBound.length === 0) {
                        var recMidY = (rec3.rect[1] + rec3.rect[3]) * 0.5;
                        var bestDistY = Infinity;
                        var bestMcidY = null;
                        for (var prI2 = 0; prI2 < pageRuns.length; prI2++) {
                            var pRun2 = pageRuns[prI2];
                            if (pRun2.mcid === null || pRun2.mcid === undefined) continue;
                            var dy = Math.abs(pRun2.baseY - recMidY);
                            if (dy < bestDistY && dy <= Math.max(18, pRun2.fontH * 1.8)) {
                                bestDistY = dy;
                                bestMcidY = pRun2.mcid;
                            }
                        }
                        if (bestMcidY !== null) {
                            existingBound.push(bestMcidY);
                        }
                    }
                    if (existingBound.length > 0) {
                        annotBoundMcidsMap[rec3.refKey] = existingBound;
                    }
                }
            }

            var claimedMcids = {};
            var mcidToAnnotInfo = {};
            var fallbackAnnotInfos = [];

            var annotsLookup = pageNode.lookup(PDFLib.PDFName.of('Annots'));
            if (annotsLookup && typeof annotsLookup.asArray === 'function') {
                var annArr = annotsLookup.asArray();
                for (var aIdx = 0; aIdx < annArr.length; aIdx++) {
                    var annotRef = annArr[aIdx];
                    var annotDict = context.lookup(annotRef);
                    if (!annotDict || typeof annotDict.get !== 'function') continue;
                    var aSubtype = String(annotDict.get(PDFLib.PDFName.of('Subtype')) || '');
                    if (aSubtype === '/Popup') {
                        if (typeof annotDict.delete === 'function') {
                            annotDict.delete(PDFLib.PDFName.of('StructParent'));
                        }
                        continue;
                    }

                    var annotDesc = 'Interaktives Element auf Seite ' + (i + 1);
                    var actionDict = annotDict.lookup ? annotDict.lookup(PDFLib.PDFName.of('A')) : null;
                    if (actionDict && typeof actionDict.get === 'function') {
                        var uriVal = actionDict.get(PDFLib.PDFName.of('URI'));
                        if (uriVal) {
                            var cleanUri = (typeof uriVal.decodeText === 'function' ? uriVal.decodeText() : String(uriVal)).replace(/^[(\s]+|[)\s]+$/g, '');
                            if (cleanUri) annotDesc = 'Verknüpfung: ' + cleanUri;
                        }
                    }
                    if (!annotDict.get(PDFLib.PDFName.of('Contents'))) {
                        annotDict.set(PDFLib.PDFName.of('Contents'), PDFLib.PDFString.of(annotDesc));
                    }
                    if (aSubtype === '/Widget' && !annotDict.get(PDFLib.PDFName.of('TU'))) {
                        annotDict.set(PDFLib.PDFName.of('TU'), PDFLib.PDFString.of(annotDesc));
                    }
                    annotDict.set(PDFLib.PDFName.of('P'), page.ref);
                    if (!annotDict.get(PDFLib.PDFName.of('F'))) {
                        annotDict.set(PDFLib.PDFName.of('F'), PDFLib.PDFNumber.of(4));
                    }

                    var spKey = nextStructParentKey++;
                    annotDict.set(PDFLib.PDFName.of('StructParent'), PDFLib.PDFNumber.of(spKey));

                    var objrDict = context.obj({
                        Type: 'OBJR',
                        Obj: annotRef,
                        Pg: page.ref
                    });
                    var annotElemTag = aSubtype === '/Link' ? 'Link' : (aSubtype === '/Widget' ? 'Form' : 'Annot');

                    var candidateMcids = annotBoundMcidsMap[String(annotRef)] || [];
                    var myMcids = [];
                    var sharedExistingAnnotInfo = null;
                    for (var cmI = 0; cmI < candidateMcids.length; cmI++) {
                        var cMcid = candidateMcids[cmI];
                        if (cMcid >= 0 && cMcid < initialPageMcidCount) {
                            if (!claimedMcids[cMcid] && myMcids.indexOf(cMcid) === -1) {
                                claimedMcids[cMcid] = true;
                                myMcids.push(cMcid);
                            } else if (mcidToAnnotInfo[cMcid] && !sharedExistingAnnotInfo) {
                                sharedExistingAnnotInfo = mcidToAnnotInfo[cMcid];
                            }
                        }
                    }

                    // If two links on the same line share the exact same MCID, attach this OBJR to that <Link> element
                    if (myMcids.length === 0 && sharedExistingAnnotInfo && sharedExistingAnnotInfo.kItems) {
                        for (var shM = 0; shM < candidateMcids.length; shM++) {
                            var shTarget = candidateMcids[shM];
                            var shBdcRegex = new RegExp('\\/(?:H[1-6]|P|Span|Link|Form|Annot)\\s*<<\\/MCID\\s+' + shTarget + '>>\\s*BDC');
                            taggedContentStr = taggedContentStr.replace(shBdcRegex, '/' + annotElemTag + ' <</MCID ' + shTarget + '>> BDC');
                        }
                        sharedExistingAnnotInfo.kItems.push(objrDict);
                        sharedExistingAnnotInfo.structElem.set(PDFLib.PDFName.of('K'), context.obj(sharedExistingAnnotInfo.kItems));
                        parentTreeEntries.push({
                            key: spKey,
                            val: sharedExistingAnnotInfo.structRef
                        });
                        continue;
                    }

                    if (myMcids.length > 0) {
                        for (var umI = 0; umI < myMcids.length; umI++) {
                            var targetM = myMcids[umI];
                            var bdcTagRegex = new RegExp('\\/(?:H[1-6]|P|Span|Link|Form|Annot)\\s*<<\\/MCID\\s+' + targetM + '>>\\s*BDC');
                            taggedContentStr = taggedContentStr.replace(bdcTagRegex, '/' + annotElemTag + ' <</MCID ' + targetM + '>> BDC');
                        }
                    } else {
                        // Fallback MCID only for graphical/widget annotations without underlying text MCID
                        var extraMcid = pageMcidCount++;
                        var aRect = annotDict.get(PDFLib.PDFName.of('Rect'));
                        var lx = 0, ly = 0;
                        if (aRect && typeof aRect.asArray === 'function' && aRect.asArray().length >= 2) {
                            lx = parseFloat(String(aRect.asArray()[0])) || 0;
                            ly = parseFloat(String(aRect.asArray()[1])) || 0;
                        }
                        taggedContentStr +=
                            '/' + annotElemTag + ' <</MCID ' + extraMcid + '>> BDC\n' +
                            'q\n' +
                            'BT\n' +
                            '/F_PDFUA 0.01 Tf\n' +
                            '3 Tr\n' +
                            lx.toFixed(2) + ' ' + ly.toFixed(2) + ' Td\n' +
                            '(Link) Tj\n' +
                            'ET\n' +
                            'Q\n' +
                            'EMC\n';
                        myMcids.push(extraMcid);
                    }

                    var kItemsForAnnot = [];
                    for (var kmI = 0; kmI < myMcids.length; kmI++) {
                        kItemsForAnnot.push(PDFLib.PDFNumber.of(myMcids[kmI]));
                    }
                    kItemsForAnnot.push(objrDict);

                    var annotStructElem = context.obj({
                        Type: 'StructElem',
                        S: PDFLib.PDFName.of(annotElemTag),
                        Pg: page.ref,
                        Alt: PDFLib.PDFString.of(annotDesc),
                        K: kItemsForAnnot
                    });
                    var annotStructRef = context.register(annotStructElem);
                    var aInfoObj = {
                        structElem: annotStructElem,
                        structRef: annotStructRef,
                        mcids: myMcids,
                        kItems: kItemsForAnnot,
                        attachedToParent: false
                    };
                    for (var mapI = 0; mapI < myMcids.length; mapI++) {
                        mcidToAnnotInfo[myMcids[mapI]] = aInfoObj;
                        if (myMcids[mapI] >= initialPageMcidCount) {
                            fallbackAnnotInfos.push(aInfoObj);
                        }
                    }

                    parentTreeEntries.push({
                        key: spKey,
                        val: annotStructRef
                    });
                }
            }

            // Ensure page still has its primary heading (<H1> on page 0, <H2> on page > 0) if MCID 0 was claimed by a <Link>
            var hasUnclaimedHeading = false;
            for (var hm = 0; hm < initialPageMcidCount; hm++) {
                if (!mcidToAnnotInfo[hm] && (pageMcidTags[hm] === 'H1' || pageMcidTags[hm] === 'H2')) {
                    hasUnclaimedHeading = true;
                    break;
                }
            }
            if (!hasUnclaimedHeading) {
                for (var hm2 = 0; hm2 < initialPageMcidCount; hm2++) {
                    if (!mcidToAnnotInfo[hm2]) {
                        var promotedTag = i === 0 ? 'H1' : 'H2';
                        pageMcidTags[hm2] = promotedTag;
                        var promoteRegex = new RegExp('\\/(?:P|Span)\\s*<<\\/MCID\\s+' + hm2 + '>>\\s*BDC');
                        taggedContentStr = taggedContentStr.replace(promoteRegex, '/' + promotedTag + ' <</MCID ' + hm2 + '>> BDC');
                        hasUnclaimedHeading = true;
                        break;
                    }
                }
            }

            var sectElemRef = context.nextRef();
            var mcidElemRefsForParentTree = [];
            var sectChildrenRefs = [];
            var lastParagraphRef = null;
            var lastParagraphElem = null;
            var lastParagraphKItems = null;

            for (var m = 0; m < pageMcidCount; m++) {
                var boundAnnotInfo = mcidToAnnotInfo[m];
                if (boundAnnotInfo) {
                    mcidElemRefsForParentTree[m] = boundAnnotInfo.structRef;
                    if (!boundAnnotInfo.attachedToParent) {
                        var wrapperTag = (!hasUnclaimedHeading && sectChildrenRefs.length === 0) ? (i === 0 ? 'H1' : 'H2') : 'P';
                        var pWrapK = [boundAnnotInfo.structRef];
                        var pWrapElem = context.obj({
                            Type: 'StructElem',
                            S: PDFLib.PDFName.of(wrapperTag),
                            P: sectElemRef,
                            Pg: page.ref,
                            K: pWrapK
                        });
                        var pWrapRef = context.register(pWrapElem);
                        boundAnnotInfo.structElem.set(PDFLib.PDFName.of('P'), pWrapRef);
                        boundAnnotInfo.attachedToParent = true;
                        sectChildrenRefs.push(pWrapRef);
                        if (wrapperTag === 'P') {
                            lastParagraphRef = pWrapRef;
                            lastParagraphElem = pWrapElem;
                            lastParagraphKItems = pWrapK;
                        }
                    }
                } else {
                    var sTag = pageMcidTags[m] || 'P';
                    var kItems = [PDFLib.PDFNumber.of(m)];
                    var pElem = context.obj({
                        Type: 'StructElem',
                        S: PDFLib.PDFName.of(sTag),
                        P: sectElemRef,
                        Pg: page.ref,
                        K: PDFLib.PDFNumber.of(m)
                    });
                    var pRef = context.register(pElem);
                    mcidElemRefsForParentTree[m] = pRef;
                    sectChildrenRefs.push(pRef);
                    if (sTag === 'P') {
                        lastParagraphRef = pRef;
                        lastParagraphElem = pElem;
                        lastParagraphKItems = kItems;
                    }
                }
            }

            // Include any user-placed visual PDF/UA Tags (e.g. <Figure> with /Alt and /BBox) on this page
            if (doc.savedA11yTags && doc.savedA11yTags.length > 0) {
                for (var ct = 0; ct < doc.savedA11yTags.length; ct++) {
                    var cTag = doc.savedA11yTags[ct];
                    if ((cTag.pageIndex || 0) !== i) continue;
                    var cTagAlt = cTag.altText || ('Element (' + (cTag.tagType || 'Figure') + ') auf Seite ' + (i + 1));
                    var cTagElem = context.obj({
                        Type: 'StructElem',
                        S: PDFLib.PDFName.of(cTag.tagType || 'Figure'),
                        P: sectElemRef,
                        Pg: page.ref,
                        Alt: PDFLib.PDFString.of(cTagAlt),
                        ActualText: PDFLib.PDFString.of(cTagAlt),
                        A: context.obj({
                            O: PDFLib.PDFName.of('Layout'),
                            BBox: cTag.bbox || [0, 0, 100, 100]
                        })
                    });
                    sectChildrenRefs.push(context.register(cTagElem));
                }
            }

            if (taggedContentStr.length > 0) {
                var newStreamBytes = stringToLatin1Bytes(taggedContentStr);
                var newFlateStream = context.flateStream(newStreamBytes);
                if (pState.contentStreamRef) {
                    context.assign(pState.contentStreamRef, newFlateStream);
                    pageNode.set(PDFLib.PDFName.of('Contents'), pState.contentStreamRef);
                } else {
                    var newStreamRef = context.register(newFlateStream);
                    pageNode.set(PDFLib.PDFName.of('Contents'), newStreamRef);
                }
            }

            parentTreeEntries.push({
                key: i,
                val: context.obj(mcidElemRefsForParentTree)
            });

            var sectObj = {
                Type: 'StructElem',
                S: PDFLib.PDFName.of('Sect'),
                P: docElemRef,
                Pg: page.ref,
                K: sectChildrenRefs
            };
            context.assign(sectElemRef, context.obj(sectObj));
            sectRefs.push(sectElemRef);
        }

        // ISO 32000-1 Section 7.9.7: Number Tree /Nums keys MUST be sorted in strictly ascending numerical order!
        parentTreeEntries.sort(function (a, b) { return a.key - b.key; });
        var parentTreeNums = [];
        for (var ptIdx = 0; ptIdx < parentTreeEntries.length; ptIdx++) {
            parentTreeNums.push(PDFLib.PDFNumber.of(parentTreeEntries[ptIdx].key));
            parentTreeNums.push(parentTreeEntries[ptIdx].val);
        }

        var docStructElem = context.obj({
            Type: 'StructElem',
            S: PDFLib.PDFName.of('Document'),
            P: structTreeRootRef,
            Lang: PDFLib.PDFString.of(fixLang),
            K: sectRefs
        });
        context.assign(docElemRef, docStructElem);

        var parentTreeRef = context.register(context.obj({
            Nums: parentTreeNums
        }));

        // Do NOT remap standard PDF structure types in /RoleMap (Matterhorn 02-004 forbids remapping standard types!)
        var structTreeRoot = context.obj({
            Type: 'StructTreeRoot',
            K: [docElemRef],
            ParentTree: parentTreeRef,
            ParentTreeNextKey: PDFLib.PDFNumber.of(nextStructParentKey)
        });
        context.assign(structTreeRootRef, structTreeRoot);
        catalog.set(PDFLib.PDFName.of('StructTreeRoot'), structTreeRootRef);

        // 5. Build /Outlines (Bookmarks synchronized with document title & page headings for PAC Quality)
        var outlinesRootRef = context.nextRef();
        var itemRefs = [];
        for (var b = 0; b < pages.length; b++) {
            itemRefs.push(context.nextRef());
        }
        for (var k = 0; k < pages.length; k++) {
            var bmHeading = extractedPageHeadings[k]
                ? (k === 0 ? fixTitle : ('Seite ' + (k + 1) + ': ' + extractedPageHeadings[k]))
                : (fixTitle + ' - Seite ' + (k + 1));
            var itemObj = {
                Title: PDFLib.PDFString.of(bmHeading),
                Parent: outlinesRootRef,
                Dest: [pages[k].ref, PDFLib.PDFName.of('Fit')]
            };
            if (k > 0) itemObj.Prev = itemRefs[k - 1];
            if (k < pages.length - 1) itemObj.Next = itemRefs[k + 1];
            context.assign(itemRefs[k], context.obj(itemObj));
        }
        var outlinesRoot = context.obj({
            Type: 'Outlines',
            First: itemRefs[0],
            Last: itemRefs[itemRefs.length - 1],
            Count: pages.length
        });
        context.assign(outlinesRootRef, outlinesRoot);
        catalog.set(PDFLib.PDFName.of('Outlines'), outlinesRootRef);

        // 6. Embed 100% PAC 2026-Compliant XMP Metadata Stream (UTF-8 BOM + W5M0MpCehiHzreSzNTczkc9d + /Info Sync)
        function escXml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        var xmpXml =
            '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
            '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.6-c015">\n' +
            ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
            '  <rdf:Description rdf:about=""\n' +
            '    xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"\n' +
            '    xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
            '    xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n' +
            '    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"\n' +
            '    xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"\n' +
            '    xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"\n' +
            '    xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">\n' +
            '   <pdfuaid:part>1</pdfuaid:part>\n' +
            '   <dc:format>application/pdf</dc:format>\n' +
            '   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + escXml(fixTitle) + '</rdf:li></rdf:Alt></dc:title>\n' +
            '   <dc:creator><rdf:Seq><rdf:li>' + escXml(fixAuthor) + '</rdf:li></rdf:Seq></dc:creator>\n' +
            '   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">' + escXml(fixSubject) + '</rdf:li></rdf:Alt></dc:description>\n' +
            '   <xmp:CreatorTool>' + escXml(fixCreator) + '</xmp:CreatorTool>\n' +
            '   <xmp:CreateDate>' + isoDateStr + '</xmp:CreateDate>\n' +
            '   <xmp:ModifyDate>' + isoDateStr + '</xmp:ModifyDate>\n' +
            '   <xmp:MetadataDate>' + isoDateStr + '</xmp:MetadataDate>\n' +
            '   <pdf:Producer>' + escXml(fixProducer) + '</pdf:Producer>\n' +
            '   <pdfaExtension:schemas>\n' +
            '    <rdf:Bag>\n' +
            '     <rdf:li rdf:parseType="Resource">\n' +
            '      <pdfaSchema:schema>PDF/UA Universal Accessibility Schema</pdfaSchema:schema>\n' +
            '      <pdfaSchema:namespaceURI>http://www.aiim.org/pdfua/ns/id/</pdfaSchema:namespaceURI>\n' +
            '      <pdfaSchema:prefix>pdfuaid</pdfaSchema:prefix>\n' +
            '      <pdfaSchema:property>\n' +
            '       <rdf:Seq>\n' +
            '        <rdf:li rdf:parseType="Resource">\n' +
            '         <pdfaProperty:name>part</pdfaProperty:name>\n' +
            '         <pdfaProperty:valueType>Integer</pdfaProperty:valueType>\n' +
            '         <pdfaProperty:category>internal</pdfaProperty:category>\n' +
            '         <pdfaProperty:description>Indicates which part of ISO 14289 standard is followed</pdfaProperty:description>\n' +
            '        </rdf:li>\n' +
            '       </rdf:Seq>\n' +
            '      </pdfaSchema:property>\n' +
            '     </rdf:li>\n' +
            '    </rdf:Bag>\n' +
            '   </pdfaExtension:schemas>\n' +
            '  </rdf:Description>\n' +
            ' </rdf:RDF>\n' +
            '</x:xmpmeta>\n' +
            '<?xpacket end="w"?>';

        var xmpUtf8Bytes = (typeof TextEncoder !== 'undefined')
            ? new TextEncoder().encode(xmpXml)
            : stringToLatin1Bytes(unescape(encodeURIComponent(xmpXml)));

        var metadataStream = context.stream(xmpUtf8Bytes, {
            Type: 'Metadata',
            Subtype: 'XML',
            Length: xmpUtf8Bytes.byteLength
        });
        var metadataRef = context.register(metadataStream);
        catalog.set(PDFLib.PDFName.of('Metadata'), metadataRef);

        doc.bytes = await pdfDoc.save({ useObjectStreams: false });
        if (silentBatchMode) {
            return doc.bytes;
        }
        doc.meta.title = fixTitle;
        doc.meta.author = fixAuthor;
        doc.meta.subject = fixSubject;
        doc.modified = true;
        populateMetadataInspector(doc);
        renderTabsBar();
        updateStatusBarInfo();

        trackUsageEvent('a11y_autofix');
        await updateAccessibilityUI(true);
        var linkSummarySuffix = totalAutoLinkedCount > 0
            ? (' — ' + totalAutoLinkedCount + ' E-Mail/URL-Verlinkung(en) automatisch als <Link> (mailto:/https://) gesetzt!')
            : '!';
        showToast('PAC 2026 Tiefen-Reparatur (PDF/UA-1 + WCAG 2.1/2.2 + Quality) abgeschlossen' + linkSummarySuffix, 'success');
        return doc.bytes;
    }

    async function exportAccessibilityReportPdf() {
        var doc = getActiveDoc();
        if (!doc) return;
        var report = await auditDocumentAccessibility(doc, false);
        if (!report) return;

        var lines = [];
        lines.push('PAC 2026 PRUEFBERICHT BARRIEREFREIHEIT (PDF/UA-1 • WCAG 2.1/2.2 • QUALITY)');
        lines.push('================================================================================');
        lines.push('Geprueftes Dokument : ' + report.docName);
        lines.push('Seitenanzahl        : ' + report.pageCount);
        lines.push('Dokumenttitel       : ' + report.docTitle);
        lines.push('Dokumentsprache     : ' + report.lang);
        lines.push('Pruefdatum          : ' + new Date().toLocaleString('de-DE'));
        lines.push('PDF/UA-1 Ergebnis   : ' + report.pdfUaPassed + ' von ' + report.pdfUaTotal + ' Kriterien bestanden');
        lines.push('WCAG 2.1 Ergebnis   : ' + report.wcagPassed + ' von ' + report.wcagTotal + ' Kriterien bestanden');
        lines.push('Quality Ergebnis    : ' + report.qualityPassed + ' von ' + report.qualityTotal + ' Kriterien bestanden');
        lines.push('Gesamtergebnis      : ' + report.score + ' % (' + report.passedCount + ' von ' + report.totalChecks + ' Kriterien erfuellt)');
        lines.push('================================================================================');
        lines.push('');

        for (var i = 0; i < report.checks.length; i++) {
            var c = report.checks[i];
            var st = c.status === 'pass' ? '[BESTANDEN]' : (c.status === 'warn' ? '[HINWEIS]  ' : '[FEHLER]   ');
            lines.push(st + ' ' + c.title);
            lines.push('            Norm   : ' + c.standard);
            lines.push('            Detail : ' + c.detail);
            lines.push('--------------------------------------------------------------------------------');
        }

        closeModal('modalAccessibility');
        await convertTextContentToPdf(lines.join('\n'), 'Pruefbericht_' + doc.name);
    }

    // =========================================================================
    // Acrobat Pro Extensions: AcroForms Flatten, Sanitize Redactions, Crop, Bates, 3-Col Header/Footer, PDF Compare
    // =========================================================================
    async function flattenAcroForms() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var form = pdfDoc.getForm();
        form.flatten();
        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        await refreshDocumentViews();
        showToast('Alle interaktiven Formularfelder wurden dauerhaft gesperrt (Flatten)!', 'success');
    }

    async function sanitizeRedactedPages() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        setProgress(20, 'Bereinige Textströme unter Schwärzungen (Sanitize)…');

        try {
            var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
            var outPdf = await PDFLib.PDFDocument.create();

            for (var p = 1; p <= pdfJsDoc.numPages; p++) {
                var page = await pdfJsDoc.getPage(p);
                var baseVp = page.getViewport({ scale: 1.0 });
                var renderVp = page.getViewport({ scale: 2.0 });

                var c = document.createElement('canvas');
                c.width = renderVp.width;
                c.height = renderVp.height;
                var ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, c.width, c.height);
                await page.render({ canvasContext: ctx, viewport: renderVp }).promise;

                var pngDataUrl = c.toDataURL('image/png');
                var embPng = await outPdf.embedPng(pngDataUrl);
                var newPage = outPdf.addPage([baseVp.width, baseVp.height]);
                newPage.drawImage(embPng, { x: 0, y: 0, width: baseVp.width, height: baseVp.height });
            }

            doc.bytes = await outPdf.save();
            doc.modified = true;
            setProgress(null);
            await refreshDocumentViews();
            trackUsageEvent('redaction_sanitized');
            showToast('Sicherheits-Schwärzung (Sanitize) abgeschlossen — darunterliegender Text physisch entfernt!', 'success');
        } catch (err) {
            setProgress(null);
            showToast('Fehler beim Sanitize: ' + err.message, 'error');
        }
    }

    async function applyCropToPages() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);

        var mmToPt = 72 / 25.4;
        var topPt = (parseFloat(document.getElementById('cropTopMm').value) || 0) * mmToPt;
        var bottomPt = (parseFloat(document.getElementById('cropBottomMm').value) || 0) * mmToPt;
        var leftPt = (parseFloat(document.getElementById('cropLeftMm').value) || 0) * mmToPt;
        var rightPt = (parseFloat(document.getElementById('cropRightMm').value) || 0) * mmToPt;
        var scope = document.getElementById('cropScope').value;

        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var pages = pdfDoc.getPages();
        var start = scope === 'current' ? doc.currentPage : 0;
        var end = scope === 'current' ? (doc.currentPage + 1) : pages.length;

        for (var i = start; i < end; i++) {
            var p = pages[i];
            var box = p.getMediaBox();
            var newX = box.x + leftPt;
            var newY = box.y + bottomPt;
            var newW = Math.max(72, box.width - leftPt - rightPt);
            var newH = Math.max(72, box.height - topPt - bottomPt);
            p.setCropBox(newX, newY, newW, newH);
            p.setMediaBox(newX, newY, newW, newH);
        }

        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        closeModal('modalCrop');
        await refreshDocumentViews();
        showToast('Seitenränder erfolgreich zugeschnitten (Crop)!', 'success');
    }

    async function applyBatesNumbering() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);

        var prefix = document.getElementById('batesPrefix').value || 'AZ-2026-';
        var startNum = parseInt(document.getElementById('batesStart').value, 10) || 1;
        var digits = parseInt(document.getElementById('batesDigits').value, 10) || 6;

        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var font = await pdfDoc.embedFont(PDFLib.StandardFonts.CourierBold);
        var pages = pdfDoc.getPages();

        for (var i = 0; i < pages.length; i++) {
            var numStr = String(startNum + i);
            while (numStr.length < digits) {
                numStr = '0' + numStr;
            }
            var batesCode = prefix + numStr;
            var p = pages[i];
            var dim = p.getSize();
            var tw = font.widthOfTextAtSize(batesCode, 10.5);
            p.drawText(batesCode, {
                x: Math.max(20, dim.width - tw - 32),
                y: dim.height - 24,
                size: 10.5,
                font: font,
                color: PDFLib.rgb(0.1, 0.2, 0.55)
            });
        }

        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        closeModal('modalBates');
        await refreshDocumentViews();

        // Automatically increment and persist Bates counter in user profile
        var nextCounter = startNum + pages.length;
        document.getElementById('batesStart').value = String(nextCounter);
        var profCounterEl = document.getElementById('profBatesCounter');
        if (profCounterEl) profCounterEl.value = String(nextCounter);

        if (state.user) {
            try {
                var fd = new FormData();
                fd.append('action', 'update_bates_counter');
                fd.append('bates_counter', String(nextCounter));
                fd.append('bates_prefix', prefix);
                var resp = await apiFetch('api.php?action=update_bates_counter', { method: 'POST', body: fd });
                var d = await resp.json();
                if (d.ok && d.user) {
                    state.user = d.user;
                }
            } catch (e) {
                console.error(e);
            }
        }

        trackUsageEvent('bates_header_footer');
        showToast('Bates-Nummerierung (' + prefix + '…) auf ' + pages.length + ' Seiten aufgebracht! Nächster Zähler: ' + nextCounter, 'success');
    }

    async function applyThreeColumnHeaderFooter() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);

        var hL = document.getElementById('hfHeaderLeft').value || '';
        var hC = document.getElementById('hfHeaderCenter').value || '';
        var hR = document.getElementById('hfHeaderRight').value || '';
        var fL = document.getElementById('hfFooterLeft').value || '';
        var fC = document.getElementById('hfFooterCenter').value || '';
        var fR = document.getElementById('hfFooterRight').value || '';

        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        var pages = pdfDoc.getPages();
        var total = pages.length;
        var today = new Date().toLocaleDateString('de-DE');

        function expandPlaceholders(tpl, pageNum) {
            return String(tpl || '')
                .replace(/\{page\}/g, String(pageNum))
                .replace(/\{total\}/g, String(total))
                .replace(/\{date\}/g, today)
                .replace(/\{file\}/g, doc.name)
                .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
        }

        for (var i = 0; i < total; i++) {
            var p = pages[i];
            var dim = p.getSize();
            var pNum = i + 1;

            var topY = dim.height - 24;
            var botY = 20;

            var tHL = expandPlaceholders(hL, pNum);
            var tHC = expandPlaceholders(hC, pNum);
            var tHR = expandPlaceholders(hR, pNum);
            var tFL = expandPlaceholders(fL, pNum);
            var tFC = expandPlaceholders(fC, pNum);
            var tFR = expandPlaceholders(fR, pNum);

            if (tHL) p.drawText(tHL, { x: 36, y: topY, size: 9, font: font, color: PDFLib.rgb(0.3, 0.34, 0.4) });
            if (tHC) {
                var wHC = font.widthOfTextAtSize(tHC, 9);
                p.drawText(tHC, { x: (dim.width - wHC) / 2, y: topY, size: 9, font: font, color: PDFLib.rgb(0.3, 0.34, 0.4) });
            }
            if (tHR) {
                var wHR = font.widthOfTextAtSize(tHR, 9);
                p.drawText(tHR, { x: dim.width - wHR - 36, y: topY, size: 9, font: font, color: PDFLib.rgb(0.3, 0.34, 0.4) });
            }

            if (tFL) p.drawText(tFL, { x: 36, y: botY, size: 9, font: font, color: PDFLib.rgb(0.3, 0.34, 0.4) });
            if (tFC) {
                var wFC = font.widthOfTextAtSize(tFC, 9);
                p.drawText(tFC, { x: (dim.width - wFC) / 2, y: botY, size: 9, font: font, color: PDFLib.rgb(0.3, 0.34, 0.4) });
            }
            if (tFR) {
                var wFR = font.widthOfTextAtSize(tFR, 9);
                p.drawText(tFR, { x: dim.width - wFR - 36, y: botY, size: 9, font: font, color: PDFLib.rgb(0.3, 0.34, 0.4) });
            }
        }

        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        closeModal('modalBates');
        await refreshDocumentViews();
        trackUsageEvent('bates_header_footer');
        showToast('Dreispaltige Kopf- & Fußzeilen auf alle Seiten angewendet!', 'success');
    }

    async function openCompareModalUI() {
        if (state.tabs.length === 0) {
            await createNewBlankPdfTab();
        }
        var selA = document.getElementById('compareSelectA');
        var selB = document.getElementById('compareSelectB');
        selA.innerHTML = '';
        selB.innerHTML = '';

        state.tabs.forEach(function (t, idx) {
            var optA = document.createElement('option');
            optA.value = t.id;
            optA.textContent = (idx + 1) + '. ' + t.name + ' (' + t.pageCount + ' S.)';
            selA.appendChild(optA);

            var optB = document.createElement('option');
            optB.value = t.id;
            optB.textContent = (idx + 1) + '. ' + t.name + ' (' + t.pageCount + ' S.)';
            selB.appendChild(optB);
        });

        if (state.tabs.length > 1) {
            selB.selectedIndex = 1;
        }
        openModal('modalCompare');
        await runPdfCompare();
    }

    async function runPdfCompare() {
        var idA = document.getElementById('compareSelectA').value;
        var idB = document.getElementById('compareSelectB').value;
        var tabA = state.tabs.find(function (t) { return t.id === idA; }) || state.tabs[0];
        var tabB = state.tabs.find(function (t) { return t.id === idB; }) || state.tabs[state.tabs.length - 1];
        if (!tabA || !tabB) return;

        await bakeAnnotationsIntoDocument(tabA);
        await bakeAnnotationsIntoDocument(tabB);

        var pdfA = await loadPdfJsDocument(tabA.bytes);
        var pdfB = await loadPdfJsDocument(tabB.bytes);

        var pageA = await pdfA.getPage(1);
        var pageB = await pdfB.getPage(1);

        var vpA = pageA.getViewport({ scale: 0.55 });
        var vpB = pageB.getViewport({ scale: 0.55 });

        var cA = document.getElementById('compareCanvasA');
        var cB = document.getElementById('compareCanvasB');
        var cDiff = document.getElementById('compareCanvasDiff');

        var w = Math.round(Math.max(vpA.width, vpB.width));
        var h = Math.round(Math.max(vpA.height, vpB.height));
        cA.width = w; cA.height = h;
        cB.width = w; cB.height = h;
        cDiff.width = w; cDiff.height = h;

        var ctxA = cA.getContext('2d');
        var ctxB = cB.getContext('2d');
        var ctxD = cDiff.getContext('2d');

        ctxA.fillStyle = '#ffffff'; ctxA.fillRect(0, 0, w, h);
        ctxB.fillStyle = '#ffffff'; ctxB.fillRect(0, 0, w, h);

        await pageA.render({ canvasContext: ctxA, viewport: vpA }).promise;
        await pageB.render({ canvasContext: ctxB, viewport: vpB }).promise;

        // Compute visual pixel diff
        var imgA = ctxA.getImageData(0, 0, w, h);
        var imgB = ctxB.getImageData(0, 0, w, h);
        var imgD = ctxD.createImageData(w, h);
        var diffPixels = 0;
        var totalPixels = w * h;

        for (var i = 0; i < imgA.data.length; i += 4) {
            var dr = Math.abs(imgA.data[i] - imgB.data[i]);
            var dg = Math.abs(imgA.data[i + 1] - imgB.data[i + 1]);
            var db = Math.abs(imgA.data[i + 2] - imgB.data[i + 2]);
            if (dr + dg + db > 38) {
                diffPixels++;
                imgD.data[i] = 239;     // Red highlight
                imgD.data[i + 1] = 68;
                imgD.data[i + 2] = 68;
                imgD.data[i + 3] = 255;
            } else {
                var gray = Math.round((imgA.data[i] + imgA.data[i + 1] + imgA.data[i + 2]) / 3);
                imgD.data[i] = gray;
                imgD.data[i + 1] = gray;
                imgD.data[i + 2] = gray;
                imgD.data[i + 3] = 95;
            }
        }
        ctxD.putImageData(imgD, 0, 0);

        var pct = ((diffPixels / (totalPixels || 1)) * 100).toFixed(2);
        var summaryBadge = document.getElementById('compareSummaryBadge');
        summaryBadge.textContent =
            diffPixels === 0
                ? '✔ Beide Dokumente sind auf Seite 1 visuell zu 100 % identisch (0,00 % Abweichung)'
                : '⚠ Visuelle Abweichung erkannt: ' + pct + ' % der Pixel unterscheiden sich (rot markiert)';
        summaryBadge.style.color = diffPixels === 0 ? '#10b981' : '#f59e0b';

        // Compute Text Diff across pages
        var tcA = await pageA.getTextContent();
        var tcB = await pageB.getTextContent();
        var linesA = tcA.items.map(function (x) { return x.str.trim(); }).filter(Boolean);
        var linesB = tcB.items.map(function (x) { return x.str.trim(); }).filter(Boolean);

        var diffHtml = [];
        var maxLen = Math.max(linesA.length, linesB.length);
        for (var l = 0; l < maxLen; l++) {
            var sA = linesA[l] !== undefined ? linesA[l] : null;
            var sB = linesB[l] !== undefined ? linesB[l] : null;
            if (sA === sB) {
                diffHtml.push('<div style="color:var(--text-secondary);">  ' + escapeHtml(sA) + '</div>');
            } else {
                if (sA !== null) {
                    diffHtml.push('<div style="color:#ef4444;background:rgba(239,68,68,0.12);padding:1px 4px;">− [A] ' + escapeHtml(sA) + '</div>');
                }
                if (sB !== null) {
                    diffHtml.push('<div style="color:#10b981;background:rgba(16,185,129,0.12);padding:1px 4px;">+ [B] ' + escapeHtml(sB) + '</div>');
                }
            }
        }
        document.getElementById('compareTextDiffOutput').innerHTML =
            diffHtml.length ? diffHtml.join('') : '<em>Kein Text gefunden.</em>';
        trackUsageEvent('pdf_compared');
    }

    // Parse ranges like "1-3, 5" into 0-based page indices
    function parsePageRangeString(rangeStr, maxPages) {
        var indices = [];
        var parts = String(rangeStr || '1').split(',');
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;
            if (part.indexOf('-') !== -1) {
                var bounds = part.split('-');
                var start = parseInt(bounds[0], 10);
                var end = parseInt(bounds[1], 10);
                if (!isNaN(start) && !isNaN(end)) {
                    for (var p = Math.min(start, end); p <= Math.max(start, end); p++) {
                        if (p >= 1 && p <= maxPages && indices.indexOf(p - 1) === -1) {
                            indices.push(p - 1);
                        }
                    }
                }
            } else {
                var num = parseInt(part, 10);
                if (!isNaN(num) && num >= 1 && num <= maxPages && indices.indexOf(num - 1) === -1) {
                    indices.push(num - 1);
                }
            }
        }
        return indices.length ? indices : [0];
    }

    // =========================================================================
    // Converters: Images <-> PDF, Office/HTML/Text -> PDF
    // =========================================================================
    async function convertImagesToPdf(fileList) {
        if (!fileList || fileList.length === 0) return;
        setProgress(20, 'Erzeuge PDF aus Bildern…');

        var pdfDoc = await PDFLib.PDFDocument.create();
        for (var i = 0; i < fileList.length; i++) {
            var file = fileList[i];
            var dataUrl = await readFileAsDataURL(file);
            var embedded;
            if (dataUrl.indexOf('image/png') !== -1) {
                embedded = await pdfDoc.embedPng(dataUrl);
            } else {
                // Convert WebP or JPG via offscreen canvas to JPG if needed
                var jpgUrl = await ensureJpgOrPngDataUrl(dataUrl);
                embedded = await pdfDoc.embedJpg(jpgUrl);
            }
            var dims = embedded.scale(1);
            var page = pdfDoc.addPage([dims.width, dims.height]);
            page.drawImage(embedded, { x: 0, y: 0, width: dims.width, height: dims.height });
        }

        var bytes = await pdfDoc.save();
        setProgress(null);
        await addDocumentTab('Bilder_Dokument.pdf', bytes, 'editor');
        trackUsageEvent('converter_used');
        showToast(fileList.length + ' Bild(er) in ein PDF umgewandelt!', 'success');
    }

    function readFileAsDataURL(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function ensureJpgOrPngDataUrl(dataUrl) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                var ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                resolve(c.toDataURL('image/jpeg', 0.92));
            };
            img.src = dataUrl;
        });
    }

    async function exportAllPagesAsZipImages() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);
        setProgress(10, 'Exportiere Seiten als PNG…');

        var pdfJsDoc = await loadPdfJsDocument(doc.bytes);
        var zip = new window.JSZip();

        for (var p = 1; p <= pdfJsDoc.numPages; p++) {
            setProgress((p / pdfJsDoc.numPages) * 90, 'Rendere Seite ' + p + '/' + pdfJsDoc.numPages);
            var page = await pdfJsDoc.getPage(p);
            var vp = page.getViewport({ scale: 2.0 });
            var c = document.createElement('canvas');
            c.width = vp.width;
            c.height = vp.height;
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            var b64 = c.toDataURL('image/png').split(',')[1];
            zip.file('Seite_' + p + '.png', b64, { base64: true });
        }

        var zipBlob = await zip.generateAsync({ type: 'blob' });
        setProgress(null);
        var cleanName = doc.name.replace(/\.pdf$/i, '') + '_Bilder.zip';
        downloadBlob(zipBlob, cleanName, 'application/zip');
        showToast('Alle Seiten als PNG-ZIP exportiert!', 'success');
    }

    async function convertTextContentToPdf(rawText, titleName) {
        var pdfDoc = await PDFLib.PDFDocument.create();
        var font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        var boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        var lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
        var wrappedLines = [];
        var maxCharsPerLine = 82;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.length <= maxCharsPerLine) {
                wrappedLines.push(line);
            } else {
                while (line.length > maxCharsPerLine) {
                    var breakIdx = line.lastIndexOf(' ', maxCharsPerLine);
                    if (breakIdx <= 10) {
                        breakIdx = maxCharsPerLine;
                    }
                    wrappedLines.push(line.slice(0, breakIdx));
                    line = line.slice(breakIdx).replace(/^\s+/, '');
                }
                if (line) wrappedLines.push(line);
            }
        }

        var page = pdfDoc.addPage([595.28, 841.89]);
        var y = 785;
        page.drawText(titleName || 'Konvertiertes Dokument', {
            x: 50,
            y: y,
            size: 15,
            font: boldFont,
            color: PDFLib.rgb(0.12, 0.25, 0.55)
        });
        y -= 28;

        for (var j = 0; j < wrappedLines.length; j++) {
            if (y < 55) {
                page = pdfDoc.addPage([595.28, 841.89]);
                y = 785;
            }
            // Strip characters outside WinAnsi range so StandardFonts never throw
            var safeLine = wrappedLines[j].replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
            page.drawText(safeLine, {
                x: 50,
                y: y,
                size: 11,
                font: font,
                color: PDFLib.rgb(0.15, 0.18, 0.22)
            });
            y -= 16;
        }

        var bytes = await pdfDoc.save();
        var fileName = (titleName || 'Konvertiert.pdf');
        if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
        await addDocumentTab(fileName, bytes, 'editor');
        trackUsageEvent('converter_used');
        showToast('Dokument erfolgreich in PDF konvertiert!', 'success');
    }

    // =========================================================================
    // PHP 5.4+ Server Workspace, User Account, Project Vault, Versioning & Email Share
    // =========================================================================
    function base64ToUint8Array(b64) {
        var bin = window.atob(b64);
        var len = bin.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
    }

    function serializeAnnotationsMap(annotationsMap) {
        var clean = {};
        if (!annotationsMap) return clean;
        Object.keys(annotationsMap).forEach(function (pageIdx) {
            var arr = annotationsMap[pageIdx] || [];
            clean[pageIdx] = arr.map(function (a) {
                var copy = {};
                Object.keys(a).forEach(function (k) {
                    if (k !== 'imgElement') {
                        copy[k] = a[k];
                    }
                });
                return copy;
            });
        });
        return clean;
    }

    async function hydrateAnnotationsMap(serializedMap) {
        var hydrated = {};
        if (!serializedMap) return hydrated;
        var pageKeys = Object.keys(serializedMap);
        for (var p = 0; p < pageKeys.length; p++) {
            var k = pageKeys[p];
            var list = serializedMap[k] || [];
            hydrated[k] = [];
            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                if (item.type === 'image' && item.dataUrl) {
                    var img = await new Promise(function (resolve) {
                        var im = new Image();
                        im.onload = function () { resolve(im); };
                        im.onerror = function () { resolve(null); };
                        im.src = item.dataUrl;
                    });
                    if (img) item.imgElement = img;
                }
                hydrated[k].push(item);
            }
        }
        return hydrated;
    }

    async function saveActivePdfToServer(options) {
        var isAutoSave = Boolean(options && options.isAutoSave);

        if (!state.user) {
            if (!isAutoSave) {
                applyUserAccountStateToUI();
                openModal('modalAccount');
                showToast('Das Speichern im Tresor ist Kontoinhabern vorbehalten. Bitte melden Sie sich an.', 'error');
            }
            return false;
        }

        var doc = getActiveDoc();
        if (!doc) {
            if (!isAutoSave) {
                showToast('Kein Dokument geöffnet.', 'error');
            }
            return false;
        }

        if (!isAutoSave) {
            setProgress(35, 'Speichere PDF + editierbares Projekt im Tresor…');
        }

        // Keep unbaked PDF bytes & live annotations so the user can continue editing seamlessly
        var unbakedBytes = new Uint8Array(doc.bytes);
        var liveAnnotationsBackup = {};
        Object.keys(doc.annotations || {}).forEach(function (k) {
            liveAnnotationsBackup[k] = (doc.annotations[k] || []).slice();
        });
        var serializedAnns = serializeAnnotationsMap(doc.annotations);
        var hasAnyAnnotations = Object.keys(serializedAnns).some(function (k) {
            return serializedAnns[k] && serializedAnns[k].length > 0;
        });

        var projectPayload = {
            currentPage: doc.currentPage || 0,
            meta: doc.meta || {},
            annotations: serializedAnns,
            savedAt: new Date().toISOString()
        };

        // Bake annotations into a finished PDF for viewing/downloading/sharing
        await bakeAnnotationsIntoDocument(doc);
        var bakedBytes = new Uint8Array(doc.bytes);

        // Restore unbaked bytes + live movable annotations in active editor tab
        if (hasAnyAnnotations) {
            doc.bytes = unbakedBytes;
            doc.annotations = liveAnnotationsBackup;
        }

        try {
            var formData = new FormData();
            formData.append('action', 'save_file');
            formData.append('filename', doc.name);
            if (isAutoSave) {
                formData.append('autosave', '1');
            }
            formData.append('file', new Blob([bakedBytes], { type: 'application/pdf' }), doc.name);
            formData.append('raw_file', new Blob([unbakedBytes], { type: 'application/pdf' }), doc.name + '.raw');
            formData.append('project_json', JSON.stringify(projectPayload));

            var resp = await apiFetch('api.php?action=save_file', {
                method: 'POST',
                body: formData
            });
            var data = await resp.json();
            if (!isAutoSave) {
                setProgress(null);
            }

            if (!data.ok) {
                if (data.quota) {
                    state.quota = data.quota;
                    renderQuotaInfoUI();
                }
                throw new Error(data.error || 'Unbekannter Serverfehler');
            }
            doc.modified = false;
            renderTabsBar();
            if (!isAutoSave) {
                switchLeftDockTab('server');
            }
            if (data.quota) {
                state.quota = data.quota;
                renderQuotaInfoUI();
            }
            state.workspaceFiles = data.files || [];
            renderServerFilesList(state.workspaceFiles);
            redrawAnnotationOverlay();

            if (!isAutoSave) {
                var verHint = data.archived_version ? ' (Vorversion automatisch archiviert)' : '';
                showToast('Im Tresor gespeichert: ' + data.filename + verHint, 'success');
            }
            return true;
        } catch (err) {
            if (!isAutoSave) {
                setProgress(null);
                showToast('Tresor-Speicherung fehlgeschlagen: ' + err.message, 'error');
            }
            return false;
        }
    }

    // =========================================================================
    // 5-Minute Automatic Document Backup (Auto-Save to Server Vault & IndexedDB)
    // =========================================================================
    function openAutoSaveDb() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                resolve(null);
                return;
            }
            var req = window.indexedDB.open('PDFEdithPro_AutoSaveDB', 1);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('snapshots')) {
                    db.createObjectStore('snapshots', { keyPath: 'key' });
                }
            };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror = function () { resolve(null); };
        });
    }

    async function saveLocalAutoSaveSnapshot(doc) {
        if (!doc) return false;
        try {
            var db = await openAutoSaveDb();
            if (!db) return false;
            var payload = {
                key: 'latest',
                name: doc.name,
                bytes: new Uint8Array(doc.bytes),
                currentPage: doc.currentPage || 0,
                meta: doc.meta || {},
                annotations: serializeAnnotationsMap(doc.annotations),
                savedAt: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now()
            };
            return await new Promise(function (resolve) {
                var tx = db.transaction('snapshots', 'readwrite');
                var store = tx.objectStore('snapshots');
                store.put(payload);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { resolve(false); };
            });
        } catch (e) {
            return false;
        }
    }

    async function loadLocalAutoSaveSnapshot() {
        try {
            var db = await openAutoSaveDb();
            if (!db) return null;
            return await new Promise(function (resolve) {
                var tx = db.transaction('snapshots', 'readonly');
                var store = tx.objectStore('snapshots');
                var req = store.get('latest');
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { resolve(null); };
            });
        } catch (e) {
            return null;
        }
    }

    async function checkLocalAutoSaveOnStartup() {
        var snap = await loadLocalAutoSaveSnapshot();
        var restoreBtn = document.getElementById('btnRestoreAutoSave');
        if (snap && snap.bytes && snap.bytes.byteLength > 8 && restoreBtn) {
            restoreBtn.classList.remove('hidden');
            restoreBtn.textContent = '🔄 Auto-Save (' + snap.name + ', ' + (snap.savedAt || '') + ')';
            restoreBtn.title = 'Zuletzt automatisch gesichertes Dokument "' + snap.name + '" (' + (snap.savedAt || '') + ' Uhr) wiederherstellen';
        }
    }

    async function restoreLocalAutoSaveSnapshot() {
        var snap = await loadLocalAutoSaveSnapshot();
        if (!snap || !snap.bytes) {
            showToast('Kein gespeicherter Auto-Save-Stand gefunden.', 'error');
            return;
        }
        var bytes = new Uint8Array(snap.bytes);
        await addDocumentTab(snap.name || 'Wiederhergestellt.pdf', bytes, 'editor');
        var doc = getActiveDoc();
        if (doc) {
            if (snap.annotations) {
                doc.annotations = await hydrateAnnotationsMap(snap.annotations);
            }
            if (typeof snap.currentPage === 'number' && snap.currentPage < doc.pageCount) {
                doc.currentPage = snap.currentPage;
            }
            if (snap.meta) {
                doc.meta = snap.meta;
            }
            await refreshDocumentViews();
        }
        var restoreBtn = document.getElementById('btnRestoreAutoSave');
        if (restoreBtn) restoreBtn.classList.add('hidden');
        showToast('Auto-Save-Stand von "' + snap.name + '" (' + (snap.savedAt || '') + ' Uhr) erfolgreich wiederhergestellt!', 'success');
    }

    function updateAutoSaveStatusUI(lastTimeStr, targetLabel) {
        var btn = document.getElementById('statusAutoSaveBtn');
        if (!btn) return;
        if (!state.autoSaveEnabled) {
            btn.textContent = '⏸️ Auto-Save (5 Min.): Aus';
            btn.style.color = 'var(--text-muted)';
            return;
        }
        btn.style.color = 'var(--accent-success)';
        if (lastTimeStr) {
            btn.textContent = '💾 Auto-Save: ' + lastTimeStr + ' Uhr (' + (targetLabel || 'Gesichert') + ')';
        } else {
            btn.textContent = '⏱️ Auto-Save (5 Min.): Aktiv';
        }
    }

    async function runPeriodicAutoSave() {
        if (!state.autoSaveEnabled || state.isAutoSaving) return;
        var doc = getActiveDoc();
        if (!doc) return;

        state.isAutoSaving = true;
        try {
            var timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            var savedLocal = await saveLocalAutoSaveSnapshot(doc);
            var targetLabel = savedLocal ? 'Lokal' : 'Aktiv';
            updateAutoSaveStatusUI(timeStr, targetLabel);
            setStatus('Automatische 5-Minuten-Sicherung durchgeführt (' + timeStr + ' Uhr — ' + targetLabel + ')');
        } catch (e) {
            console.error(e);
        } finally {
            state.isAutoSaving = false;
        }
    }

    function toggleAutoSave() {
        state.autoSaveEnabled = !state.autoSaveEnabled;
        updateAutoSaveStatusUI(null, null);
        if (state.autoSaveEnabled) {
            showToast('Automatische Dokumentensicherung (alle 5 Minuten) aktiviert!', 'success');
            runPeriodicAutoSave();
        } else {
            showToast('Automatische 5-Minuten-Sicherung pausiert.');
        }
    }

    function initAutoSaveTimer() {
        if (state.autoSaveTimer) {
            clearInterval(state.autoSaveTimer);
        }
        // Automatically save active document every 5 minutes (300,000 ms)
        state.autoSaveTimer = setInterval(function () {
            runPeriodicAutoSave();
        }, state.autoSaveIntervalMs);
        updateAutoSaveStatusUI(null, null);
        checkLocalAutoSaveOnStartup();
    }

    function renderQuotaInfoUI() {
        var q = state.quota;
        var textEl = document.getElementById('vaultQuotaText');
        var fillEl = document.getElementById('vaultQuotaFill');
        var accLabel = document.getElementById('accProfileQuotaLabel');

        if (!q) {
            if (textEl) textEl.textContent = '— / —';
            if (fillEl) fillEl.style.width = '0%';
            return;
        }

        var pct = typeof q.percent === 'number' ? q.percent : 0;
        var labelStr = q.quota_bytes > 0
            ? (q.used_formatted + ' / ' + q.quota_formatted + ' (' + pct + ' %)')
            : (q.used_formatted + ' / Unbegrenzt');

        if (textEl) {
            textEl.textContent = labelStr;
        }
        if (fillEl) {
            fillEl.style.width = Math.min(100, Math.max(0, pct)) + '%';
            fillEl.style.background = pct >= 90 ? '#ef4444' : (pct >= 75 ? '#f59e0b' : 'var(--accent-primary)');
        }
        if (accLabel) {
            accLabel.textContent = '📦 Tresor-Speicherplatz (config.php): ' + labelStr;
        }
    }

    async function loadServerWorkspaceFiles() {
        try {
            var resp = await apiFetch('api.php?action=status');
            var data = await resp.json();
            if (data.ok) {
                updateCsrfFromData(data);
                state.user = data.user || null;
                state.quota = data.quota || null;
                state.workspaceFiles = data.files || [];
                applyUserAccountStateToUI();
                renderQuotaInfoUI();
                renderServerFilesList(state.workspaceFiles);
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderServerFilesList(files) {
        state.workspaceFiles = files || [];
        el.serverFilesList.innerHTML = '';
        var authControls = document.getElementById('vaultAuthControls');

        if (!state.user) {
            if (authControls) authControls.classList.add('hidden');
            el.serverFilesList.innerHTML =
                '<div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:14px 12px;text-align:center;">' +
                '  <div style="font-size:24px;margin-bottom:6px;">🔒</div>' +
                '  <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);margin-bottom:6px;">Tresor durch Login geschützt</div>' +
                '  <div style="color:var(--text-secondary);font-size:11.5px;line-height:1.45;margin-bottom:12px;">' +
                '    Das Speichern und Verwalten von Dokumenten, Projekten und Versionen im Tresor ist angemeldeten Kontoinhabern vorbehalten.' +
                '  </div>' +
                '  <button type="button" class="tool-btn btn-primary" data-cmd="open-account-modal" style="width:100%;">' +
                '    🔑 Anmelden / Konto anlegen' +
                '  </button>' +
                '</div>';
            return;
        }

        if (authControls) authControls.classList.remove('hidden');

        if (!files || files.length === 0) {
            el.serverFilesList.innerHTML =
                '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:16px 6px;line-height:1.4;">' +
                'Ihr persönlicher Tresor ist noch leer. Klicken Sie oben auf „Projekt &amp; PDF speichern“.' +
                '</div>';
            return;
        }

        files.forEach(function (f) {
            var card = document.createElement('div');
            card.style.cssText = 'background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;';

            var badgesHtml = '';
            if (f.has_project) {
                badgesHtml += '<span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,0.18);color:#60a5fa;margin-right:4px;">✎ Editierbares Projekt</span>';
            }
            if (f.version_count && f.version_count > 0) {
                badgesHtml += '<span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(16,185,129,0.16);color:#10b981;">🕒 ' + f.version_count + ' Version(en)</span>';
            }

            card.innerHTML =
                '<div style="font-weight:600;font-size:12px;word-break:break-all;margin-bottom:3px;">📄 ' + escapeHtml(f.name) + '</div>' +
                (badgesHtml ? '<div style="margin-bottom:5px;">' + badgesHtml + '</div>' : '') +
                '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:7px;">' +
                escapeHtml(f.size_formatted) + ' • ' + escapeHtml(f.modified) +
                '</div>' +
                '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                '  <button type="button" class="tool-btn btn-primary" data-srv-edit="' + escapeHtml(f.name) + '" style="height:24px;font-size:11px;flex:1;" title="Dokument inklusive verschiebbarer Textfelder/Annotationen weiterbearbeiten">✎ Weiterbearbeiten</button>' +
                '  <button type="button" class="tool-btn" data-srv-ver="' + escapeHtml(f.name) + '" style="height:24px;font-size:11px;padding:0 7px;" title="Versionshistorie & PDF-Diff">🕒</button>' +
                '  <button type="button" class="tool-btn" data-srv-share="' + escapeHtml(f.name) + '" style="height:24px;font-size:11px;padding:0 7px;" title="Per E-Mail teilen">✉️</button>' +
                '  <button type="button" class="tool-btn btn-danger" data-srv-del="' + escapeHtml(f.name) + '" style="height:24px;font-size:11px;padding:0 7px;" title="Löschen">🗑</button>' +
                '</div>';

            card.querySelector('[data-srv-edit]').addEventListener('click', async function () {
                await openProjectFromVault(f.name);
            });

            card.querySelector('[data-srv-ver]').addEventListener('click', async function () {
                await openVersionHistoryModal(f.name);
            });

            card.querySelector('[data-srv-share]').addEventListener('click', async function () {
                await openShareModalUI(f.name);
            });

            card.querySelector('[data-srv-del]').addEventListener('click', async function () {
                var fd = new FormData();
                fd.append('filename', f.name);
                var resp = await apiFetch('api.php?action=delete_file', { method: 'POST', body: fd });
                var data = await resp.json();
                if (data.ok) {
                    if (data.quota) {
                        state.quota = data.quota;
                        renderQuotaInfoUI();
                    }
                    renderServerFilesList(data.files || []);
                    showToast('Datei aus dem Tresor gelöscht');
                }
            });

            el.serverFilesList.appendChild(card);
        });
    }

    async function openProjectFromVault(filename) {
        try {
            setProgress(35, 'Lade Projekt aus dem Tresor…');
            var resp = await fetch('api.php?action=load_project&filename=' + encodeURIComponent(filename));
            var data = await resp.json();
            setProgress(null);

            if (!data.ok) {
                throw new Error(data.error || 'Fehler beim Laden');
            }

            var bytes = base64ToUint8Array(data.pdf_base64);
            await addDocumentTab(data.filename, bytes, 'editor');
            var doc = getActiveDoc();

            if (doc && data.has_project && data.project) {
                if (data.project.annotations) {
                    doc.annotations = await hydrateAnnotationsMap(data.project.annotations);
                }
                if (typeof data.project.currentPage === 'number' && data.project.currentPage < doc.pageCount) {
                    doc.currentPage = data.project.currentPage;
                }
                if (data.project.meta) {
                    doc.meta = data.project.meta;
                }
                await refreshDocumentViews();
                showToast('Projekt geladen (alle Textfelder, Stempel & Tags sind wieder frei bearbeitbar)!', 'success');
            } else {
                showToast('PDF aus dem Tresor geladen: ' + data.filename, 'success');
            }
        } catch (err) {
            setProgress(null);
            showToast('Laden fehlgeschlagen: ' + err.message, 'error');
        }
    }

    async function openVersionHistoryModal(filename) {
        document.getElementById('versionModalDocTitle').textContent = filename;
        var listEl = document.getElementById('versionHistoryList');
        listEl.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Lade Versionen…</div>';
        openModal('modalVersions');

        try {
            var resp = await fetch('api.php?action=list_versions&filename=' + encodeURIComponent(filename));
            var data = await resp.json();
            var versions = (data && data.versions) ? data.versions : [];

            if (versions.length === 0) {
                listEl.innerHTML =
                    '<div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;padding:14px;font-size:12px;color:var(--text-secondary);text-align:center;">' +
                    'Für <b>' + escapeHtml(filename) + '</b> existieren noch keine älteren Zwischenstände.<br>Sobald Sie das Dokument erneut im Tresor speichern, wird der vorherige Stand hier automatisch als Version archiviert.' +
                    '</div>';
                return;
            }

            listEl.innerHTML = '';
            versions.forEach(function (v) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;padding:10px 12px;gap:10px;flex-wrap:wrap;';
                row.innerHTML =
                    '<div>' +
                    '  <div style="font-weight:700;font-size:12.5px;">🕒 ' + escapeHtml(v.label) + '</div>' +
                    '  <div style="font-size:11px;color:var(--text-secondary);">Dateigröße: ' + escapeHtml(v.size_formatted) + '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:6px;">' +
                    '  <button type="button" class="tool-btn" data-ver-open="' + escapeHtml(v.version_file) + '">📂 Als Tab öffnen</button>' +
                    '  <button type="button" class="tool-btn btn-primary" data-ver-diff="' + escapeHtml(v.version_file) + '">⚖️ Im PDF-Diff vergleichen</button>' +
                    '</div>';

                row.querySelector('[data-ver-open]').addEventListener('click', async function () {
                    var r = await fetch('api.php?action=load_version&version_file=' + encodeURIComponent(v.version_file));
                    if (r.ok) {
                        var buf = await r.arrayBuffer();
                        closeModal('modalVersions');
                        await addDocumentTab('v' + v.version_num + '_' + filename, new Uint8Array(buf), 'editor');
                        showToast('Version ' + v.version_num + ' als Tab geöffnet!', 'success');
                    }
                });

                row.querySelector('[data-ver-diff]').addEventListener('click', async function () {
                    setProgress(35, 'Lade Versionen für visuellen PDF-Diff…');
                    var rOld = await fetch('api.php?action=load_version&version_file=' + encodeURIComponent(v.version_file));
                    var rCur = await fetch('api.php?action=load_file&filename=' + encodeURIComponent(filename));
                    setProgress(null);
                    if (rOld.ok && rCur.ok) {
                        var bufOld = await rOld.arrayBuffer();
                        var bufCur = await rCur.arrayBuffer();
                        closeModal('modalVersions');
                        await addDocumentTab('v' + v.version_num + '_' + filename, new Uint8Array(bufOld), 'editor');
                        var tabOldId = state.activeTabId;
                        await addDocumentTab('Aktuell_' + filename, new Uint8Array(bufCur), 'editor');
                        var tabCurId = state.activeTabId;
                        await openCompareModalUI();
                        document.getElementById('compareSelectA').value = tabOldId;
                        document.getElementById('compareSelectB').value = tabCurId;
                        await runPdfCompare();
                    }
                });

                listEl.appendChild(row);
            });
        } catch (err) {
            listEl.innerHTML = '<div style="color:var(--accent-danger);font-size:12px;">Fehler: ' + escapeHtml(err.message) + '</div>';
        }
    }

    function applyUserAccountStateToUI() {
        var headerBtn = document.getElementById('accountHeaderBtn');
        var headerLabel = document.getElementById('accountHeaderLabel');
        var headerChangePassBtn = document.getElementById('headerChangePassBtn');
        var headerLogoutBtn = document.getElementById('headerLogoutBtn');
        var ribbonLogoutBtn = document.getElementById('ribbonLogoutBtn');
        var vaultStatusLabel = document.getElementById('vaultStatusLabel');
        var guestSec = document.getElementById('accountGuestSection');
        var userSec = document.getElementById('accountUserSection');
        var resetSec = document.getElementById('accountResetPasswordSection');
        if (resetSec) resetSec.classList.add('hidden');

        if (state.user) {
            var u = state.user;
            var p = u.profile || {};
            if (headerLabel) headerLabel.textContent = u.display_name || u.username;
            if (headerBtn) {
                headerBtn.style.background = 'rgba(16, 185, 129, 0.18)';
                headerBtn.style.color = '#10b981';
                headerBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            }
            if (headerChangePassBtn) headerChangePassBtn.classList.remove('hidden');
            if (headerLogoutBtn) headerLogoutBtn.classList.remove('hidden');
            if (ribbonLogoutBtn) ribbonLogoutBtn.classList.remove('hidden');
            if (vaultStatusLabel) {
                vaultStatusLabel.textContent = '🔒 Tresor: ' + (u.display_name || u.username);
            }
            if (guestSec) guestSec.classList.add('hidden');
            if (userSec) userSec.classList.remove('hidden');

            document.getElementById('accProfileBannerName').textContent =
                '👤 ' + (u.display_name || u.username) + (p.organization ? ' (' + p.organization + ')' : '');
            document.getElementById('accProfileBannerSub').textContent =
                'Benutzername: ' + u.username + ' • E-Mail: ' + (u.email || '—') + ' • Privater Tresor aktiv';

            // Populate Account Profile form inputs
            document.getElementById('profDisplayName').value = u.display_name || '';
            document.getElementById('profEmail').value = u.email || '';
            document.getElementById('profAuthor').value = p.default_author || u.display_name || '';
            document.getElementById('profOrg').value = p.organization || '';
            document.getElementById('profLang').value = p.default_lang || 'de-DE';
            document.getElementById('profWatermark').value = p.default_watermark || 'VERTRAULICH';
            document.getElementById('profBatesPrefix').value = p.bates_prefix || 'AZ-2026-';
            document.getElementById('profBatesCounter').value = p.bates_counter || 1;
            document.getElementById('profFooterLeft').value = p.footer_left || u.display_name || '';
            document.getElementById('profFooterRight').value = p.footer_right || 'Seite {page} von {total}';

            // Pre-fill workspace tool inputs with user's personal profile templates
            var metaAuthorEl = document.getElementById('metaAuthor');
            if (metaAuthorEl && !metaAuthorEl.value) {
                metaAuthorEl.value = p.default_author || u.display_name || '';
            }
            var wmTextEl = document.getElementById('wmText');
            if (wmTextEl && !wmTextEl.value && p.default_watermark) {
                wmTextEl.value = p.default_watermark;
            }
            var a11yLangEl = document.getElementById('a11yFixLang');
            if (a11yLangEl && p.default_lang) {
                a11yLangEl.value = p.default_lang;
            }
            var batesPrefEl = document.getElementById('batesPrefix');
            if (batesPrefEl && p.bates_prefix) {
                batesPrefEl.value = p.bates_prefix;
            }
            var batesStartEl = document.getElementById('batesStart');
            if (batesStartEl && p.bates_counter) {
                batesStartEl.value = String(p.bates_counter);
            }
            var hfLeftEl = document.getElementById('hfFooterLeft');
            if (hfLeftEl && p.footer_left) {
                hfLeftEl.value = p.footer_left;
            }
            var hfRightEl = document.getElementById('hfFooterRight');
            if (hfRightEl && p.footer_right) {
                hfRightEl.value = p.footer_right;
            }

            renderUserStampsVault();
            renderSignatureVaultList();
        } else {
            if (headerLabel) headerLabel.textContent = 'Konto / Login (Gast)';
            if (headerBtn) {
                headerBtn.style.background = 'rgba(59, 130, 246, 0.16)';
                headerBtn.style.color = '#60a5fa';
                headerBtn.style.borderColor = 'rgba(59, 130, 246, 0.35)';
            }
            if (headerChangePassBtn) headerChangePassBtn.classList.add('hidden');
            if (headerLogoutBtn) headerLogoutBtn.classList.add('hidden');
            if (ribbonLogoutBtn) ribbonLogoutBtn.classList.add('hidden');
            if (vaultStatusLabel) {
                vaultStatusLabel.textContent = '🔒 Tresor (Login erforderlich)';
            }
            if (guestSec) guestSec.classList.remove('hidden');
            if (userSec) userSec.classList.add('hidden');
            renderUserStampsVault();
            renderSignatureVaultList();
        }
    }

    async function performLogoutAccount() {
        var resp = await apiFetch('api.php?action=logout', { method: 'POST' });
        var data = await resp.json();
        updateCsrfFromData(data);
        state.user = null;
        state.quota = (data && data.quota) ? data.quota : null;
        state.workspaceFiles = (data && data.files) ? data.files : [];
        applyUserAccountStateToUI();
        renderQuotaInfoUI();
        renderServerFilesList(state.workspaceFiles);
        closeModal('modalAccount');
        showToast('Sie wurden erfolgreich abgemeldet.');
    }

    function openPasswordChangeModal() {
        applyUserAccountStateToUI();
        openModal('modalAccount');
        setTimeout(function () {
            var passCard = document.getElementById('accountPasswordChangeCard');
            var curInput = document.getElementById('changePassCurrent');
            if (passCard && passCard.scrollIntoView) {
                passCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            if (curInput) {
                curInput.focus();
            }
        }, 80);
    }

    function renderUserStampsVault() {
        var stampSelect = document.getElementById('propStampText');
        var listEl = document.getElementById('accountStampsList');

        // Rebuild #propStampText options (Standard + User Custom Stamps)
        var today = new Date().toLocaleDateString('de-DE');
        var standardStamps = [
            'BEZAHLT', 'GENEHMIGT', 'VERTRAULICH', 'ENTWURF', 'KOPIE', 'GEPRÜFT',
            'EINGEGANGEN AM ' + today
        ];
        var customStamps = (state.user && state.user.stamps) ? state.user.stamps : [];

        if (stampSelect) {
            var currentVal = stampSelect.value;
            stampSelect.innerHTML = '';
            customStamps.forEach(function (st) {
                var opt = document.createElement('option');
                opt.value = st.text;
                opt.textContent = '★ ' + st.text;
                stampSelect.appendChild(opt);
            });
            standardStamps.forEach(function (txt) {
                var opt = document.createElement('option');
                opt.value = txt;
                opt.textContent = txt;
                stampSelect.appendChild(opt);
            });
            if (currentVal) stampSelect.value = currentVal;
        }

        if (!listEl) return;
        listEl.innerHTML = '';
        if (customStamps.length === 0) {
            listEl.innerHTML = '<span style="font-size:11.5px;color:var(--text-muted);">Noch keine eigenen Stempel hinterlegt.</span>';
            return;
        }

        customStamps.forEach(function (st) {
            var badge = document.createElement('div');
            badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;border:1.5px solid ' + escapeHtml(st.color || '#16a34a') + ';background:var(--bg-input);font-size:11.5px;font-weight:700;color:' + escapeHtml(st.color || '#16a34a') + ';';
            badge.innerHTML =
                '<span>' + escapeHtml(st.text) + '</span>' +
                '<button type="button" style="border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:12px;" title="Stempel entfernen">✕</button>';
            badge.querySelector('button').addEventListener('click', async function () {
                var fd = new FormData();
                fd.append('action', 'delete_stamp_vault');
                fd.append('stamp_id', st.id);
                var resp = await apiFetch('api.php?action=delete_stamp_vault', { method: 'POST', body: fd });
                var d = await resp.json();
                if (d.ok && d.user) {
                    state.user = d.user;
                    renderUserStampsVault();
                    showToast('Stempel aus Tresor entfernt');
                }
            });
            listEl.appendChild(badge);
        });
    }

    function renderSignatureVaultList() {
        var container = document.getElementById('sigVaultList');
        if (!container) return;
        container.innerHTML = '';

        if (!state.user) {
            container.innerHTML =
                '<div style="grid-column:1/-1;font-size:11.5px;color:var(--text-secondary);background:var(--bg-card);padding:8px 10px;border-radius:6px;border:1px solid var(--border-subtle);">' +
                '💡 Tipp: <a href="#" id="linkOpenLoginFromSig" style="color:var(--accent-primary);text-decoration:underline;">Melden Sie sich in Ihrem Konto an</a>, um Ihre Unterschriften &amp; Paraphen dauerhaft im Tresor zu speichern.' +
                '</div>';
            var lnk = container.querySelector('#linkOpenLoginFromSig');
            if (lnk) {
                lnk.addEventListener('click', function (e) {
                    e.preventDefault();
                    closeModal('modalSignature');
                    openModal('modalAccount');
                });
            }
            return;
        }

        var sigs = state.user.signatures || [];
        if (sigs.length === 0) {
            container.innerHTML =
                '<div style="grid-column:1/-1;font-size:11.5px;color:var(--text-muted);">Noch keine Unterschriften im Konto-Tresor gespeichert. Zeichnen Sie oben und klicken Sie auf „⭐ Im Konto-Tresor speichern“.</div>';
            return;
        }

        sigs.forEach(function (sig) {
            var safeDataUrl = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(sig.data_url || ''))
                ? sig.data_url
                : '';
            var card = document.createElement('div');
            card.style.cssText = 'background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:5px;';
            card.innerHTML =
                '<div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(sig.title) + '</div>' +
                '<div style="background:#fff;border-radius:4px;height:46px;display:flex;align-items:center;justify-content:center;padding:2px;">' +
                '  <img src="' + safeDataUrl + '" alt="Signatur" style="max-width:100%;max-height:42px;object-fit:contain;">' +
                '</div>' +
                '<div style="display:flex;gap:4px;">' +
                '  <button type="button" class="tool-btn btn-primary" data-sig-use style="height:22px;font-size:10.5px;flex:1;">✔ Einsetzen</button>' +
                '  <button type="button" class="tool-btn btn-danger" data-sig-del style="height:22px;font-size:10.5px;padding:0 6px;">🗑</button>' +
                '</div>';

            card.querySelector('[data-sig-use]').addEventListener('click', function () {
                if (safeDataUrl) insertSignatureDataUrlOnPage(safeDataUrl);
            });

            card.querySelector('[data-sig-del]').addEventListener('click', async function () {
                var fd = new FormData();
                fd.append('action', 'delete_signature_vault');
                fd.append('sig_id', sig.id);
                var resp = await apiFetch('api.php?action=delete_signature_vault', { method: 'POST', body: fd });
                var d = await resp.json();
                if (d.ok && d.user) {
                    state.user = d.user;
                    renderSignatureVaultList();
                    showToast('Unterschrift aus dem Tresor gelöscht');
                }
            });

            container.appendChild(card);
        });
    }

    function insertSignatureDataUrlOnPage(dataUrl) {
        var doc = getActiveDoc();
        if (!doc) {
            closeModal('modalSignature');
            return;
        }
        var img = new Image();
        img.onload = function () {
            var list = getPageAnnotations(doc, doc.currentPage);
            list.push({
                type: 'image',
                x: 80,
                y: 540,
                w: 190,
                h: 65,
                dataUrl: dataUrl,
                imgElement: img
            });
            doc.modified = true;
            closeModal('modalSignature');
            switchView('editor');
            setActiveTool('select');
            state.selectedAnnotationIndex = list.length - 1;
            redrawAnnotationOverlay();
            trackUsageEvent('signature_applied');
            showToast('Unterschrift eingefügt (frei verschiebbar mit der Maus)', 'success');
        };
        img.src = dataUrl;
    }

    async function openShareModalUI(preselectedFilename) {
        if (!state.user) {
            applyUserAccountStateToUI();
            openModal('modalAccount');
            showToast('E-Mail-Freigaben aus dem Tresor sind Kontoinhabern vorbehalten. Bitte melden Sie sich an.', 'error');
            return;
        }
        var selectEl = document.getElementById('shareFilenameSelect');
        selectEl.innerHTML = '';
        document.getElementById('shareResultBox').classList.add('hidden');

        var activeDoc = getActiveDoc();
        var addedNames = {};

        if (activeDoc) {
            var optActive = document.createElement('option');
            optActive.value = activeDoc.name;
            optActive.textContent = '📌 Aktueller Tab: ' + activeDoc.name;
            selectEl.appendChild(optActive);
            addedNames[activeDoc.name] = true;
        }

        (state.workspaceFiles || []).forEach(function (f) {
            if (!addedNames[f.name]) {
                var opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = '☁️ Tresor: ' + f.name;
                selectEl.appendChild(opt);
                addedNames[f.name] = true;
            }
        });

        if (preselectedFilename && addedNames[preselectedFilename]) {
            selectEl.value = preselectedFilename;
        }

        openModal('modalShare');
        await refreshActiveSharesList();
    }

    async function refreshActiveSharesList() {
        var container = document.getElementById('activeSharesList');
        if (!container) return;
        try {
            var resp = await fetch('api.php?action=list_shares');
            var data = await resp.json();
            var shares = (data && data.shares) ? data.shares : [];
            if (shares.length === 0) {
                container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Noch keine aktiven E-Mail-Freigaben erstellt.</div>';
                return;
            }
            container.innerHTML = '';
            shares.forEach(function (s) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 12px;gap:10px;flex-wrap:wrap;';
                row.innerHTML =
                    '<div style="flex:1;min-width:220px;">' +
                    '  <div style="font-weight:700;font-size:12px;">📄 ' + escapeHtml(s.filename) + ' → ✉️ ' + escapeHtml(s.recipient_email) + '</div>' +
                    '  <div style="font-size:11px;color:var(--text-secondary);">' +
                    (s.allow_edit ? '✎ Bearbeiten & Gegenzeichnen' : '👁 Nur Lesen') + ' • Gültig bis: ' + escapeHtml(s.expires_formatted) +
                    '  </div>' +
                    '</div>' +
                    '<div style="display:flex;gap:6px;">' +
                    '  <button type="button" class="tool-btn" data-copy-share="' + escapeHtml(s.share_url) + '" style="height:24px;font-size:11px;">📋 Link</button>' +
                    '  <button type="button" class="tool-btn btn-danger" data-del-share="' + escapeHtml(s.token) + '" style="height:24px;font-size:11px;">Widerrufen</button>' +
                    '</div>';

                row.querySelector('[data-copy-share]').addEventListener('click', function () {
                    navigator.clipboard.writeText(s.share_url);
                    showToast('Freigabe-Link in die Zwischenablage kopiert!', 'success');
                });

                row.querySelector('[data-del-share]').addEventListener('click', async function () {
                    var fd = new FormData();
                    fd.append('action', 'delete_share');
                    fd.append('token', s.token);
                    await apiFetch('api.php?action=delete_share', { method: 'POST', body: fd });
                    await refreshActiveSharesList();
                    showToast('Freigabe-Link widerrufen');
                });

                container.appendChild(row);
            });
        } catch (err) {
            console.error(err);
        }
    }

    async function checkIncomingSharedDocumentLink() {
        var params = new URLSearchParams(window.location.search);
        var shareToken = params.get('share');
        if (!shareToken) return;

        try {
            setProgress(35, 'Lade geteiltes PDF-Dokument…');
            var resp = await fetch('api.php?action=load_share&token=' + encodeURIComponent(shareToken));
            var data = await resp.json();
            setProgress(null);

            if (!data.ok) {
                showToast(data.error || 'Freigabe-Link konnte nicht geladen werden.', 'error');
                return;
            }

            var bytes = base64ToUint8Array(data.pdf_base64);
            await addDocumentTab(data.share.filename, bytes, 'editor');
            var doc = getActiveDoc();
            if (doc && data.project && data.project.annotations) {
                doc.annotations = await hydrateAnnotationsMap(data.project.annotations);
                await refreshDocumentViews();
            }

            var msgInfo = data.share.message ? ' — Nachricht: "' + data.share.message + '"' : '';
            showToast('Geteiltes Dokument von ' + data.share.owner_name + ' geöffnet' + msgInfo, 'success');
        } catch (err) {
            setProgress(null);
            showToast('Fehler beim Öffnen der Freigabe: ' + err.message, 'error');
        }
    }

    async function checkIncomingPasswordResetToken() {
        var params = new URLSearchParams(window.location.search);
        var resetToken = params.get('reset_token');
        if (!resetToken) return;

        try {
            var resp = await fetch('api.php?action=verify_reset_token&token=' + encodeURIComponent(resetToken));
            var data = await resp.json();
            if (!data.ok) {
                showToast(data.error || 'Zurücksetzungs-Link ist ungültig oder abgelaufen.', 'error');
                return;
            }

            document.getElementById('accountGuestSection').classList.add('hidden');
            document.getElementById('accountUserSection').classList.add('hidden');
            var resetSec = document.getElementById('accountResetPasswordSection');
            resetSec.classList.remove('hidden');

            document.getElementById('resetPassTokenHidden').value = resetToken;
            document.getElementById('resetPassAccountBadge').innerHTML =
                'Konto: <strong>' + escapeHtml(data.display_name) + ' (' + escapeHtml(data.username) + ')</strong><br>' +
                'E-Mail: ' + escapeHtml(data.email);

            openModal('modalAccount');
            showToast('Bitte geben Sie jetzt Ihr neues Passwort ein.', 'success');
        } catch (err) {
            showToast('Fehler bei der Prüfung des Links: ' + err.message, 'error');
        }
    }

    // =========================================================================
    // Signature Pad Modal Logic
    // =========================================================================
    function initSignatureModal() {
        var sigCanvas = document.getElementById('signatureCanvas');
        var ctx = sigCanvas.getContext('2d');
        var drawing = false;

        function clearSig() {
            ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
        }

        sigCanvas.addEventListener('mousedown', function (e) {
            drawing = true;
            var r = sigCanvas.getBoundingClientRect();
            ctx.strokeStyle = document.getElementById('sigPenColor').value || '#1d4ed8';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
        });

        sigCanvas.addEventListener('mousemove', function (e) {
            if (!drawing) return;
            var r = sigCanvas.getBoundingClientRect();
            ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
            ctx.stroke();
        });

        window.addEventListener('mouseup', function () {
            drawing = false;
        });

        document.getElementById('sigTypedInput').addEventListener('input', function (e) {
            var val = e.target.value;
            clearSig();
            if (!val) return;
            ctx.save();
            ctx.font = 'italic 600 44px "Georgia", "Times New Roman", serif';
            ctx.fillStyle = document.getElementById('sigPenColor').value || '#1d4ed8';
            ctx.textBaseline = 'middle';
            ctx.fillText(val, 35, sigCanvas.height / 2);
            ctx.restore();
        });

        document.getElementById('btnClearSignature').addEventListener('click', function () {
            document.getElementById('sigTypedInput').value = '';
            clearSig();
        });

        document.getElementById('btnApplySignature').addEventListener('click', function () {
            var dataUrl = sigCanvas.toDataURL('image/png');
            insertSignatureDataUrlOnPage(dataUrl);
        });

        var btnSaveVault = document.getElementById('btnSaveSigToVault');
        if (btnSaveVault) {
            btnSaveVault.addEventListener('click', async function () {
                if (!state.user) {
                    closeModal('modalSignature');
                    openModal('modalAccount');
                    showToast('Bitte melden Sie sich kurz an, um Unterschriften im Konto-Tresor zu speichern.');
                    return;
                }
                var title = document.getElementById('sigVaultTitleInput').value.trim() || ('Signatur ' + ((state.user.signatures || []).length + 1));
                var dataUrl = sigCanvas.toDataURL('image/png');
                var fd = new FormData();
                fd.append('action', 'save_signature_vault');
                fd.append('title', title);
                fd.append('data_url', dataUrl);

                var resp = await apiFetch('api.php?action=save_signature_vault', { method: 'POST', body: fd });
                var d = await resp.json();
                if (d.ok && d.user) {
                    state.user = d.user;
                    document.getElementById('sigVaultTitleInput').value = '';
                    renderSignatureVaultList();
                    showToast('Unterschrift "' + title + '" im Konto-Tresor gespeichert!', 'success');
                } else {
                    showToast(d.error || 'Speichern fehlgeschlagen', 'error');
                }
            });
        }
    }

    // =========================================================================
    // Modals, Context Menu, Menus & Command Dispatcher
    // =========================================================================
    function openModal(id) {
        var m = document.getElementById(id);
        if (m) {
            m.classList.remove('hidden');
            m.classList.add('open');
        }
    }

    function closeModal(id) {
        var m = document.getElementById(id);
        if (m) {
            m.classList.remove('open');
        }
    }

    function openContextMenu(x, y, pageIndex) {
        state.contextPageIndex = pageIndex;
        var cm = document.getElementById('desktopContextMenu');
        cm.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        cm.style.top = Math.min(y, window.innerHeight - 260) + 'px';
        cm.classList.add('open');
    }

    function closeAllPopups() {
        document.getElementById('desktopContextMenu').classList.remove('open');
        var openMenus = document.querySelectorAll('.menu-item.open');
        for (var i = 0; i < openMenus.length; i++) {
            openMenus[i].classList.remove('open');
        }
    }

    async function executeCommand(cmd) {
        closeAllPopups();
        var doc = getActiveDoc();

        switch (cmd) {
            case 'new-blank-pdf':
                await createNewBlankPdfTab();
                break;
            case 'open-pdf':
                document.getElementById('hiddenPdfInput').click();
                break;
            case 'merge-files':
            case 'open-merge-modal':
                await openMergeModalUI();
                break;
            case 'open-images':
                document.getElementById('hiddenImagesInput').click();
                break;
            case 'insert-image-overlay':
                if (!doc) {
                    await createNewBlankPdfTab();
                }
                document.getElementById('hiddenOverlayImageInput').click();
                break;
            case 'save-server':
                await saveActivePdfToServer();
                break;
            case 'export-pdf':
                if (!doc) {
                    showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
                    return;
                }
                if (doc.ocrApplied && doc.name && !/-OCR\.pdf$/i.test(doc.name)) {
                    doc.name = doc.name.replace(/\.pdf$/i, '') + '-OCR.pdf';
                }
                await bakeAnnotationsIntoDocument(doc);
                downloadBlob(doc.bytes, doc.name, 'application/pdf');
                doc.modified = false;
                renderTabsBar();
                trackUsageEvent('pdf_exported');
                showToast('PDF heruntergeladen: ' + doc.name, 'success');
                break;
            case 'export-images-zip':
                await exportAllPagesAsZipImages();
                break;
            case 'export-current-png':
                if (!doc) return;
                if (state.viewMode !== 'editor') await switchView('editor');
                await renderCurrentEditorPage();
                var pngUrl = el.pdfCanvas.toDataURL('image/png');
                var a = document.createElement('a');
                a.href = pngUrl;
                a.download = doc.name.replace(/\.pdf$/i, '') + '_Seite_' + (doc.currentPage + 1) + '.png';
                a.click();
                showToast('Aktuelle Seite als PNG exportiert', 'success');
                break;
            case 'print-pdf':
                if (!doc) return;
                await bakeAnnotationsIntoDocument(doc);
                var blobUrl = URL.createObjectURL(new Blob([doc.bytes], { type: 'application/pdf' }));
                var win = window.open(blobUrl, '_blank');
                if (win) win.focus();
                break;
            case 'undo':
                if (!doc) return;
                var list = getPageAnnotations(doc, doc.currentPage);
                if (list.length > 0) {
                    list.pop();
                    state.selectedAnnotationIndex = -1;
                    redrawAnnotationOverlay();
                    showToast('Letzte Annotation rückgängig gemacht');
                }
                break;
            case 'clear-annotations':
                if (!doc) return;
                doc.annotations[doc.currentPage] = [];
                state.selectedAnnotationIndex = -1;
                redrawAnnotationOverlay();
                showToast('Annotationen auf dieser Seite entfernt');
                break;
            case 'delete-selected-annotation':
                if (!doc) return;
                var anns = getPageAnnotations(doc, doc.currentPage);
                if (state.selectedAnnotationIndex >= 0 && state.selectedAnnotationIndex < anns.length) {
                    anns.splice(state.selectedAnnotationIndex, 1);
                    state.selectedAnnotationIndex = -1;
                    redrawAnnotationOverlay();
                }
                break;
            case 'bake-annotations':
                if (!doc) return;
                await bakeAnnotationsIntoDocument(doc);
                await refreshDocumentViews();
                showToast('Alle Annotationen fest in das PDF eingebettet!', 'success');
                break;
            case 'add-blank-page':
                await insertBlankPage();
                break;
            case 'duplicate-page':
                await duplicateCurrentPage();
                break;
            case 'rotate-left':
                if (doc) await rotatePageAt(doc.currentPage, -90);
                break;
            case 'rotate-right':
                if (doc) await rotatePageAt(doc.currentPage, 90);
                break;
            case 'rotate-all-left':
                await rotateAllPages(-90);
                break;
            case 'rotate-all-right':
                await rotateAllPages(90);
                break;
            case 'reverse-pages':
                await reversePageOrder();
                break;
            case 'delete-page':
                if (doc) await deletePageAt(doc.currentPage);
                break;
            case 'extract-current-page':
                if (!doc) return;
                await bakeAnnotationsIntoDocument(doc);
                var src = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
                var single = await PDFLib.PDFDocument.create();
                var cp = await single.copyPages(src, [doc.currentPage]);
                single.addPage(cp[0]);
                var sBytes = await single.save();
                downloadBlob(sBytes, doc.name.replace(/\.pdf$/i, '') + '_Seite_' + (doc.currentPage + 1) + '.pdf', 'application/pdf');
                showToast('Einzelseite als PDF heruntergeladen', 'success');
                break;
            case 'view-launcher':
                switchView('launcher');
                break;
            case 'view-organizer':
                if (!doc) await createNewBlankPdfTab();
                switchView('organizer');
                break;
            case 'view-editor':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                break;
            case 'launch-tool-edit-text':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                switchRibbonTab('edit');
                setActiveTool('edit-text');
                break;
            case 'launch-tool-text':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                switchRibbonTab('edit');
                setActiveTool('text');
                break;
            case 'launch-tool-redact':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                setActiveTool('redact');
                break;
            case 'zoom-in':
                state.zoom = Math.min(2.5, Math.round((state.zoom + 0.15) * 100) / 100);
                if (el.floatingZoomLabel) el.floatingZoomLabel.textContent = Math.round(state.zoom * 100) + '%';
                if (el.zoomPercentLabel) el.zoomPercentLabel.textContent = Math.round(state.zoom * 100) + '%';
                if (el.zoomSlider) el.zoomSlider.value = Math.round(state.zoom * 100);
                if (state.viewMode === 'organizer') {
                    renderOrganizerGrid();
                } else {
                    if (doc && state.viewMode === 'launcher') switchView('editor');
                    renderCurrentEditorPage();
                }
                break;
            case 'zoom-out':
                state.zoom = Math.max(0.5, Math.round((state.zoom - 0.15) * 100) / 100);
                if (el.floatingZoomLabel) el.floatingZoomLabel.textContent = Math.round(state.zoom * 100) + '%';
                if (el.zoomPercentLabel) el.zoomPercentLabel.textContent = Math.round(state.zoom * 100) + '%';
                if (el.zoomSlider) el.zoomSlider.value = Math.round(state.zoom * 100);
                if (state.viewMode === 'organizer') {
                    renderOrganizerGrid();
                } else {
                    if (doc && state.viewMode === 'launcher') switchView('editor');
                    renderCurrentEditorPage();
                }
                break;
            case 'zoom-reset':
                state.zoom = 1.0;
                if (el.floatingZoomLabel) el.floatingZoomLabel.textContent = '100%';
                if (el.zoomPercentLabel) el.zoomPercentLabel.textContent = '100%';
                if (el.zoomSlider) el.zoomSlider.value = 100;
                if (state.viewMode === 'organizer') {
                    renderOrganizerGrid();
                } else {
                    if (doc && state.viewMode === 'launcher') switchView('editor');
                    renderCurrentEditorPage();
                }
                break;
            case 'prev-page':
                if (doc && doc.currentPage > 0) {
                    stopTtsReading(true);
                    doc.currentPage--;
                    renderCurrentEditorPage();
                }
                break;
            case 'next-page':
                if (doc && doc.currentPage < doc.pageCount - 1) {
                    stopTtsReading(true);
                    doc.currentPage++;
                    renderCurrentEditorPage();
                }
                break;
            case 'toggle-left-dock':
                document.getElementById('leftDock').classList.toggle('collapsed');
                break;
            case 'toggle-right-dock':
                document.getElementById('rightDock').classList.toggle('collapsed');
                break;
            case 'toggle-theme':
                document.body.classList.toggle('theme-light');
                document.body.classList.toggle('theme-dark');
                break;
            case 'toggle-fullscreen':
                await toggleFullscreen();
                break;
            case 'open-tray-panel':
                switchLeftDockTab('tray');
                if (!doc) await createNewBlankPdfTab();
                break;
            case 'add-current-to-tray':
                if (doc) await addPageToTray(doc.currentPage);
                break;
            case 'build-pdf-from-tray':
                await buildPdfFromTray();
                break;
            case 'clear-tray':
                state.tray = [];
                renderTrayList();
                break;
            case 'refresh-server-files':
                await loadServerWorkspaceFiles();
                break;
            case 'open-signature-modal':
                if (!doc) await createNewBlankPdfTab();
                openModal('modalSignature');
                break;
            case 'open-split-modal':
                if (!doc) await createNewBlankPdfTab();
                openModal('modalSplit');
                break;
            case 'open-converter-modal':
                openModal('modalConverter');
                break;
            case 'open-server-modal':
                openModal('modalServer');
                break;
            case 'open-help':
                window.open('hilfe.php', '_blank');
                break;
            case 'open-account-modal':
                applyUserAccountStateToUI();
                openModal('modalAccount');
                break;
            case 'open-password-change':
                openPasswordChangeModal();
                break;
            case 'logout-account':
                await performLogoutAccount();
                break;
            case 'toggle-autosave':
                toggleAutoSave();
                break;
            case 'restore-autosave':
                await restoreLocalAutoSaveSnapshot();
                break;
            case 'open-share-modal':
                if (!doc && (!state.workspaceFiles || state.workspaceFiles.length === 0)) {
                    await createNewBlankPdfTab();
                }
                await openShareModalUI();
                break;
            case 'open-a11y-modal':
                await updateAccessibilityUI(true);
                break;
            case 'quick-autofix-a11y':
                if (!doc) await createNewBlankPdfTab();
                await updateAccessibilityUI(false);
                await remediatePdfAccessibility();
                await updateAccessibilityUI(true);
                break;
            case 'export-a11y-report':
                if (!doc) await createNewBlankPdfTab();
                await exportAccessibilityReportPdf();
                break;
            case 'open-crop-modal':
                if (!doc) await createNewBlankPdfTab();
                openModal('modalCrop');
                break;
            case 'open-bates-modal':
                if (!doc) await createNewBlankPdfTab();
                openModal('modalBates');
                break;
            case 'open-compare-modal':
                await openCompareModalUI();
                break;
            case 'open-compress-modal':
            case 'focus-compress':
            case 'focus-metadata':
                await openCompressModalUI();
                break;
            case 'flatten-form':
                if (!doc) await createNewBlankPdfTab();
                await flattenAcroForms();
                break;
            case 'sanitize-redactions':
                if (!doc) await createNewBlankPdfTab();
                await sanitizeRedactedPages();
                break;
            case 'launch-tool-forms':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                switchRibbonTab('forms');
                setActiveTool('form-text');
                break;
            case 'merge-all-tabs':
                await mergeAllOpenTabs();
                break;
            case 'focus-watermark':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                var rdWm = document.getElementById('rightDock');
                if (rdWm) rdWm.classList.remove('collapsed');
                document.getElementById('wmText').focus();
                break;
            case 'focus-ocr':
                if (!doc) await createNewBlankPdfTab();
                switchView('editor');
                var rdOcr = document.getElementById('rightDock');
                if (rdOcr) rdOcr.classList.remove('collapsed');
                document.getElementById('ocrLang').focus();
                break;
            case 'apply-watermark':
                await applyWatermarkToAllPages();
                break;
            case 'apply-page-numbers':
                await applyPageNumbersToAllPages();
                break;
            case 'run-compression':
                await runPdfCompression();
                break;
            case 'apply-metadata':
                await applyMetadataToDocument(false);
                break;
            case 'extract-page-text':
                await extractEmbeddedPageText(false);
                break;
            case 'tts-toggle-read':
                await toggleTtsReading();
                break;
            case 'tts-read-page':
                await startTtsReadingPage();
                break;
            case 'tts-pause-resume':
                pauseOrResumeTts();
                break;
            case 'tts-stop':
                stopTtsReading(false);
                break;
            case 'extract-all-text':
                if (!doc) await createNewBlankPdfTab();
                var fullTxt = await extractEmbeddedPageText(true);
                if (fullTxt) {
                    downloadBlob(fullTxt, (getActiveDoc().name.replace(/\.pdf$/i, '') + '.txt'), 'text/plain;charset=utf-8');
                }
                break;
            case 'run-ocr-page':
                await runOcrOnCurrentPage();
                break;
            case 'make-searchable-pdf':
                if (!doc) {
                    showToast('Bitte öffnen Sie zuerst ein gescanntes PDF oder Bild.', 'error');
                    document.getElementById('hiddenPdfInput').click();
                    return;
                }
                if (state.viewMode !== 'editor') {
                    await switchView('editor');
                }
                await convertToSearchableSandwichPdf();
                break;
            case 'copy-ocr-text':
                var txtArea = document.getElementById('ocrOutputText');
                txtArea.select();
                document.execCommand('copy');
                showToast('Text in die Zwischenablage kopiert');
                break;
            case 'download-ocr-text':
                var content = document.getElementById('ocrOutputText').value;
                downloadBlob(content, 'Extrahierter_Text.txt', 'text/plain;charset=utf-8');
                break;
            case 'open-email-modal':
                await openEmailPdfModal();
                break;
            case 'open-batch-modal':
                openModal('modalBatchProcess');
                break;
            case 'open-zugferd-modal':
                await openZugferdModal();
                break;
            case 'open-qrcode-modal':
                await openQrCodeModal();
                break;
            case 'open-change-password-modal':
                var curInp = document.getElementById('userCurPwInput');
                var np1Inp = document.getElementById('userNewPw1Input');
                var np2Inp = document.getElementById('userNewPw2Input');
                var stBox = document.getElementById('userPwChangeStatus');
                if (curInp) curInp.value = '';
                if (np1Inp) np1Inp.value = '';
                if (np2Inp) np2Inp.value = '';
                if (stBox) {
                    stBox.classList.add('hidden');
                    stBox.textContent = '';
                }
                openModal('modalChangeUserPassword');
                if (curInp) setTimeout(function () { curInp.focus(); }, 60);
                break;
            case 'open-autoredact-modal':
                await openAutoRedactModal();
                break;
            case 'open-attachments-modal':
                await openAttachmentsModal();
                break;
            case 'open-bookmarks-modal':
                await openBookmarksModal();
                break;
            case 'open-sanitize-meta-modal':
                await openSanitizeMetaModal();
                break;
            case 'open-nup-modal':
                await openNupBookletModal();
                break;
            case 'open-mailmerge-modal':
                await openMailMergeModal();
                break;
            case 'open-cert-sign-modal':
                await openDigitalCertSignModal('sign');
                break;
        }
    }

    // =========================================================================
    // 1. Direct PDF Email Sender (via SMTP configured in admin.php)
    // =========================================================================
    async function openEmailPdfModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst eine PDF-Datei, die Sie per E-Mail versenden möchten.', 'error');
            return;
        }
        var subjInp = document.getElementById('emailPdfSubject');
        var msgInp = document.getElementById('emailPdfMessage');
        var statusBox = document.getElementById('emailPdfStatusBox');
        if (subjInp && !subjInp.value.trim()) {
            subjInp.value = 'PDF-Dokument: ' + doc.name;
        }
        if (msgInp && !msgInp.value.trim()) {
            msgInp.value = 'Guten Tag,\n\nanbei erhalten Sie das PDF-Dokument "' + doc.name + '".\n\nMit freundlichen Grüßen';
        }
        if (statusBox) {
            statusBox.style.display = 'none';
            statusBox.textContent = '';
        }
        openModal('modalSendEmail');
    }

    async function sendCurrentPdfByEmail() {
        var doc = getActiveDoc();
        if (!doc) return;

        var rcpt = (document.getElementById('emailPdfRecipient').value || '').trim();
        var replyTo = (document.getElementById('emailPdfReplyTo').value || '').trim();
        var subj = (document.getElementById('emailPdfSubject').value || '').trim();
        var msg = (document.getElementById('emailPdfMessage').value || '').trim();
        var statusBox = document.getElementById('emailPdfStatusBox');
        var sendBtn = document.getElementById('btnSendPdfEmailNow');

        if (!rcpt || rcpt.indexOf('@') === -1) {
            showToast('Bitte geben Sie eine gültige Empfänger-E-Mail-Adresse ein.', 'error');
            return;
        }

        if (sendBtn) sendBtn.disabled = true;
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.style.background = 'rgba(59,130,246,0.14)';
            statusBox.style.color = '#93c5fd';
            statusBox.textContent = '⏳ Bereite PDF-Anhang vor und verbinde mit SMTP-Server…';
        }

        try {
            await bakeAnnotationsIntoDocument(doc);
            var fd = new FormData();
            fd.append('action', 'send_pdf_email');
            fd.append('csrf_token', window.PDFSTUDIO_CSRF_TOKEN || '');
            fd.append('to_email', rcpt);
            fd.append('reply_to', replyTo);
            fd.append('subject', subj || ('PDF-Dokument: ' + doc.name));
            fd.append('message', msg);
            fd.append('filename', doc.name);
            fd.append('pdf_file', new Blob([doc.bytes], { type: 'application/pdf' }), doc.name);

            var resp = await fetch('api.php', {
                method: 'POST',
                headers: { 'X-CSRF-Token': window.PDFSTUDIO_CSRF_TOKEN || '' },
                body: fd
            });
            var data = await resp.json();
            if (data && data.ok) {
                if (statusBox) {
                    statusBox.style.background = 'rgba(16,185,129,0.16)';
                    statusBox.style.color = '#6ee7b7';
                    statusBox.textContent = '✔ ' + (data.message || 'E-Mail erfolgreich gesendet!');
                }
                showToast(data.message || 'PDF erfolgreich per E-Mail gesendet!', 'success');
                setTimeout(function () {
                    closeModal('modalSendEmail');
                }, 1400);
            } else {
                var errTxt = (data && data.error) ? data.error : 'Versand fehlgeschlagen.';
                if (statusBox) {
                    statusBox.style.background = 'rgba(239,68,68,0.16)';
                    statusBox.style.color = '#fca5a5';
                    statusBox.textContent = '⚠️ ' + errTxt;
                }
                showToast(errTxt, 'error');
            }
        } catch (err) {
            if (statusBox) {
                statusBox.style.background = 'rgba(239,68,68,0.16)';
                statusBox.style.color = '#fca5a5';
                statusBox.textContent = '⚠️ Netzwerkfehler beim E-Mail-Versand: ' + err.message;
            }
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    // =========================================================================
    // 2. Multi-PDF Batch Processing (Stapelverarbeitung -> ZIP)
    // =========================================================================
    async function runBatchProcessing() {
        var fileInp = document.getElementById('batchPdfFilesInput');
        var useOpenTabs = document.getElementById('batchUseOpenTabs') && document.getElementById('batchUseOpenTabs').checked;
        var doPdfUa = document.getElementById('batchActionPdfUa') && document.getElementById('batchActionPdfUa').checked;
        var doPageNums = document.getElementById('batchActionPageNumbers') && document.getElementById('batchActionPageNumbers').checked;
        var doWatermark = document.getElementById('batchActionWatermark') && document.getElementById('batchActionWatermark').checked;
        var wmText = (document.getElementById('batchWatermarkText') && document.getElementById('batchWatermarkText').value) || 'VERTRAULICH';

        var items = [];
        if (fileInp && fileInp.files && fileInp.files.length > 0) {
            for (var fIdx = 0; fIdx < fileInp.files.length; fIdx++) {
                var f = fileInp.files[fIdx];
                var ab = await f.arrayBuffer();
                items.push({ name: f.name, bytes: new Uint8Array(ab) });
            }
        }
        if (useOpenTabs && state.docs && state.docs.length > 0) {
            for (var dIdx = 0; dIdx < state.docs.length; dIdx++) {
                var openDoc = state.docs[dIdx];
                await bakeAnnotationsIntoDocument(openDoc);
                items.push({ name: openDoc.name, bytes: new Uint8Array(openDoc.bytes) });
            }
        }

        if (items.length === 0) {
            showToast('Bitte wählen Sie mindestens eine PDF-Datei aus oder öffnen Sie ein PDF-Tab.', 'error');
            return;
        }
        if (!doPdfUa && !doPageNums && !doWatermark) {
            showToast('Bitte wählen Sie mindestens eine Stapel-Aktion aus.', 'error');
            return;
        }

        var progBox = document.getElementById('batchProgressBox');
        var progLbl = document.getElementById('batchProgressLabel');
        var progBar = document.getElementById('batchProgressBar');
        var runBtn = document.getElementById('btnRunBatchProcess');
        if (runBtn) runBtn.disabled = true;
        if (progBox) progBox.style.display = 'block';

        try {
            var zip = new window.JSZip();
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var pct = Math.round(((i) / items.length) * 100);
                if (progBar) progBar.style.width = pct + '%';
                if (progLbl) progLbl.textContent = 'Verarbeite Datei ' + (i + 1) + ' von ' + items.length + ': ' + item.name + '…';

                var currentBytes = item.bytes;

                // Optional Action A: Watermark & Page Numbers
                if (doPageNums || doWatermark) {
                    var pDoc = await PDFLib.PDFDocument.load(currentBytes, { ignoreEncryption: true });
                    var font = await pDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
                    var pages = pDoc.getPages();
                    for (var p = 0; p < pages.length; p++) {
                        var pg = pages[p];
                        var sz = pg.getSize();
                        if (doWatermark && wmText.trim()) {
                            pg.drawText(wmText.trim(), {
                                x: sz.width * 0.18,
                                y: sz.height * 0.45,
                                size: Math.min(48, Math.max(24, sz.width * 0.07)),
                                font: font,
                                color: PDFLib.rgb(0.75, 0.15, 0.15),
                                opacity: 0.22,
                                rotate: PDFLib.degrees(35)
                            });
                        }
                        if (doPageNums) {
                            var numStr = 'Seite ' + (p + 1) + ' / ' + pages.length;
                            pg.drawText(numStr, {
                                x: sz.width / 2 - 28,
                                y: 18,
                                size: 9.5,
                                font: font,
                                color: PDFLib.rgb(0.2, 0.2, 0.2)
                            });
                        }
                    }
                    currentBytes = await pDoc.save({ useObjectStreams: false });
                }

                // Optional Action B: Full PDF/UA-1 & WCAG 2.1 Auto-Fix
                if (doPdfUa) {
                    var tempDocObj = {
                        name: item.name,
                        bytes: currentBytes,
                        meta: {},
                        savedA11yTags: []
                    };
                    var fixedBytes = await remediatePdfAccessibility(tempDocObj, true);
                    if (fixedBytes) {
                        currentBytes = fixedBytes;
                    }
                }

                var outName = item.name.replace(/\.pdf$/i, '') + (doPdfUa ? '_barrierefrei.pdf' : '_bearbeitet.pdf');
                zip.file(outName, currentBytes);
            }

            if (progBar) progBar.style.width = '100%';
            if (progLbl) progLbl.textContent = '✔ Alle ' + items.length + ' PDF-Dateien verarbeitet — erzeuge ZIP-Archiv…';

            var zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, 'PDF-Werkstatt-Stapel_' + items.length + '_Dateien.zip', 'application/zip');
            trackUsageEvent('batch_processed');
            showToast('Stapelverarbeitung für ' + items.length + ' PDF-Dateien erfolgreich abgeschlossen!', 'success');
        } catch (err) {
            showToast('Fehler bei der Stapelverarbeitung: ' + err.message, 'error');
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    // =========================================================================
    // 3. E-Rechnung: ZUGFeRD 2.x / Factur-X & XRechnung (Inspector & Embedder)
    // =========================================================================
    var currentExtractedZugferdXml = '';

    function extractZugferdXmlFromPdfBytes(pdfBytes) {
        try {
            var rawLatin1 = bytesToLatin1String(pdfBytes);
            // 1. Check direct uncompressed XML inside PDF binary
            var xmlStartMarkers = ['<rsm:CrossIndustryInvoice', '<rsm:CrossIndustryDocument', '<CrossIndustryInvoice', '<ubl:Invoice', '<Invoice'];
            for (var m = 0; m < xmlStartMarkers.length; m++) {
                var pos = rawLatin1.indexOf(xmlStartMarkers[m]);
                if (pos !== -1) {
                    var startIdx = rawLatin1.lastIndexOf('<?xml', pos);
                    if (startIdx === -1 || (pos - startIdx) > 400) startIdx = pos;
                    var endTags = ['</rsm:CrossIndustryInvoice>', '</rsm:CrossIndustryDocument>', '</CrossIndustryInvoice>', '</ubl:Invoice>', '</Invoice>'];
                    for (var e = 0; e < endTags.length; e++) {
                        var endPos = rawLatin1.indexOf(endTags[e], pos);
                        if (endPos !== -1) {
                            var sliceBytes = pdfBytes.subarray(startIdx, endPos + endTags[e].length);
                            return new TextDecoder('utf-8').decode(sliceBytes);
                        }
                    }
                }
            }
        } catch (err) {}
        return null;
    }

    async function findZugferdXmlInDocument(doc) {
        if (!doc || !doc.bytes) return null;
        var direct = extractZugferdXmlFromPdfBytes(doc.bytes);
        if (direct) return direct;

        try {
            var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var allObjs = pdfDoc.context.enumerateIndirectObjects();
            for (var i = 0; i < allObjs.length; i++) {
                var obj = allObjs[i][1];
                if (obj && (obj instanceof PDFLib.PDFRawStream || obj.contents)) {
                    try {
                        var decBytes = PDFLib.decodePDFRawStream(obj).decode();
                        var xmlStr = new TextDecoder('utf-8').decode(decBytes);
                        if (xmlStr.indexOf('CrossIndustryInvoice') !== -1 || xmlStr.indexOf('CrossIndustryDocument') !== -1 || xmlStr.indexOf(':Invoice') !== -1 || xmlStr.indexOf('<Invoice') !== -1) {
                            return xmlStr;
                        }
                    } catch (e) {}
                }
            }
        } catch (err) {}
        return null;
    }

    function parseZugferdOrXRechnungXml(xmlString) {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        if (!xmlDoc || xmlDoc.getElementsByTagName('parsererror').length > 0) {
            return null;
        }

        function firstText(localNames, rootNode) {
            var ctx = rootNode || xmlDoc;
            var all = ctx.getElementsByTagName('*');
            for (var n = 0; n < localNames.length; n++) {
                var target = localNames[n].toLowerCase();
                for (var i = 0; i < all.length; i++) {
                    var ln = (all[i].localName || all[i].nodeName.replace(/^.*:/, '')).toLowerCase();
                    if (ln === target && all[i].textContent && all[i].textContent.trim()) {
                        return all[i].textContent.trim();
                    }
                }
            }
            return '';
        }

        function findNodeByLocalName(localName, rootNode) {
            var ctx = rootNode || xmlDoc;
            var all = ctx.getElementsByTagName('*');
            var target = localName.toLowerCase();
            for (var i = 0; i < all.length; i++) {
                var ln = (all[i].localName || all[i].nodeName.replace(/^.*:/, '')).toLowerCase();
                if (ln === target) return all[i];
            }
            return null;
        }

        var exchDoc = findNodeByLocalName('ExchangedDocument');
        var invId = exchDoc ? firstText(['ID'], exchDoc) : firstText(['ID']);
        var rawDate = exchDoc ? firstText(['IssueDateTime', 'DateTimeString'], exchDoc) : firstText(['IssueDate', 'DateTimeString']);
        if (/^\d{8}$/.test(rawDate)) {
            rawDate = rawDate.slice(6, 8) + '.' + rawDate.slice(4, 6) + '.' + rawDate.slice(0, 4);
        }
        var buyerRef = firstText(['BuyerReference']);

        var sellerNode = findNodeByLocalName('SellerTradeParty') || findNodeByLocalName('AccountingSupplierParty');
        var sellerName = sellerNode ? firstText(['Name', 'RegistrationName'], sellerNode) : '—';
        var sellerCity = sellerNode ? firstText(['CityName'], sellerNode) : '';

        var buyerNode = findNodeByLocalName('BuyerTradeParty') || findNodeByLocalName('AccountingCustomerParty');
        var buyerName = buyerNode ? firstText(['Name', 'RegistrationName'], buyerNode) : '—';
        var buyerCity = buyerNode ? firstText(['CityName'], buyerNode) : '';

        var iban = firstText(['IBANID', 'ID'], findNodeByLocalName('PayeePartyCreditorFinancialAccount') || findNodeByLocalName('PayeeFinancialAccount') || xmlDoc);
        var sumNode = findNodeByLocalName('SpecifiedTradeSettlementHeaderMonetarySummation') || findNodeByLocalName('LegalMonetaryTotal');
        var netAmt = sumNode ? firstText(['TaxBasisTotalAmount', 'LineTotalAmount', 'TaxExclusiveAmount'], sumNode) : '0.00';
        var taxAmt = sumNode ? firstText(['TaxTotalAmount'], sumNode) : firstText(['TaxAmount']);
        var grossAmt = sumNode ? firstText(['GrandTotalAmount', 'TaxInclusiveAmount'], sumNode) : '0.00';
        var dueAmt = sumNode ? firstText(['DuePayableAmount', 'PayableAmount'], sumNode) : grossAmt;

        var items = [];
        var allNodes = xmlDoc.getElementsByTagName('*');
        for (var idx = 0; idx < allNodes.length; idx++) {
            var ln = (allNodes[idx].localName || allNodes[idx].nodeName.replace(/^.*:/, '')).toLowerCase();
            if (ln === 'includedsuupplychaintradelineitem' || ln === 'includedsupplychaintradelineitem' || ln === 'invoiceline') {
                var itemNode = allNodes[idx];
                items.push({
                    name: firstText(['Name', 'Description'], itemNode) || ('Position ' + (items.length + 1)),
                    qty: firstText(['BilledQuantity', 'InvoicedQuantity'], itemNode) || '1',
                    total: firstText(['LineTotalAmount', 'LineExtensionAmount'], itemNode) || '—'
                });
            }
        }

        return {
            invId: invId || '—',
            invDate: rawDate || '—',
            buyerRef: buyerRef || '—',
            sellerName: sellerName,
            sellerCity: sellerCity,
            buyerName: buyerName,
            buyerCity: buyerCity,
            iban: iban || '—',
            netAmt: netAmt || '0.00',
            taxAmt: taxAmt || '0.00',
            grossAmt: grossAmt || '0.00',
            dueAmt: dueAmt || '0.00',
            items: items
        };
    }

    function renderZugferdDataInModal(xmlStr) {
        var titleEl = document.getElementById('zugferdStatusTitle');
        var subEl = document.getElementById('zugferdStatusSub');
        var viewEl = document.getElementById('zugferdInvoiceView');
        var dlBtn = document.getElementById('btnZugferdDownloadXml');

        if (!xmlStr) {
            currentExtractedZugferdXml = '';
            if (titleEl) titleEl.textContent = 'ℹ️ Keine eingebettete E-Rechnung (ZUGFeRD / XRechnung) im aktuellen PDF gefunden.';
            if (subEl) subEl.textContent = 'Sie können unten im Formular eine ZUGFeRD 2.2 (EN 16931) E-Rechnung direkt in dieses PDF einbetten oder oben eine externe XML-Datei laden.';
            if (viewEl) viewEl.style.display = 'none';
            if (dlBtn) dlBtn.style.display = 'none';
            return;
        }

        var parsed = parseZugferdOrXRechnungXml(xmlStr);
        if (!parsed) {
            if (titleEl) titleEl.textContent = '⚠️ Eingebettete XML-Daten konnten nicht als ZUGFeRD/XRechnung gelesen werden.';
            return;
        }

        currentExtractedZugferdXml = xmlStr;
        if (titleEl) titleEl.textContent = '✔ E-Rechnung erkannt (ZUGFeRD / Factur-X / XRechnung EN 16931)';
        if (subEl) subEl.textContent = 'Strukturierter XML-Rechnungsdatensatz wurde erfolgreich ausgelesen.';
        if (viewEl) viewEl.style.display = 'block';
        if (dlBtn) dlBtn.style.display = 'inline-flex';

        document.getElementById('zfInvIdDate').textContent = parsed.invId + ' vom ' + parsed.invDate;
        document.getElementById('zfBuyerRef').textContent = 'Leitweg-ID / Referenz: ' + parsed.buyerRef;
        document.getElementById('zfSellerInfo').textContent = parsed.sellerName + (parsed.sellerCity ? (' (' + parsed.sellerCity + ')') : '');
        document.getElementById('zfBuyerInfo').textContent = parsed.buyerName + (parsed.buyerCity ? (' (' + parsed.buyerCity + ')') : '');
        document.getElementById('zfPaymentInfo').textContent = 'IBAN: ' + parsed.iban;
        document.getElementById('zfTotalsInfo').textContent = 'Netto: ' + parsed.netAmt + ' € | MwSt: ' + parsed.taxAmt + ' € | Brutto: ' + parsed.grossAmt + ' €';

        // Pre-fill form
        if (parsed.invId !== '—') document.getElementById('zfGenInvNumber').value = parsed.invId;
        if (parsed.buyerRef !== '—') document.getElementById('zfGenLeitweg').value = parsed.buyerRef;
        if (parsed.sellerName !== '—') document.getElementById('zfGenSeller').value = parsed.sellerName;
        if (parsed.buyerName !== '—') document.getElementById('zfGenBuyer').value = parsed.buyerName;
        if (parsed.iban !== '—') document.getElementById('zfGenIban').value = parsed.iban;
        if (!isNaN(parseFloat(parsed.netAmt))) document.getElementById('zfGenNet').value = parseFloat(parsed.netAmt).toFixed(2);

        var tblWrap = document.getElementById('zfLineItemsTable');
        if (tblWrap) {
            if (parsed.items.length === 0) {
                tblWrap.innerHTML = '<div style="color:var(--text-secondary);">Keine Einzelpositionen angegeben.</div>';
            } else {
                var html = '<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border-subtle);text-align:left;">' +
                           '<th style="padding:4px;">Pos.</th><th style="padding:4px;">Bezeichnung</th><th style="padding:4px;">Menge</th><th style="padding:4px;text-align:right;">Betrag</th></tr></thead><tbody>';
                for (var r = 0; r < parsed.items.length; r++) {
                    html += '<tr style="border-bottom:1px solid var(--border-subtle);">' +
                            '<td style="padding:4px;">' + (r + 1) + '</td>' +
                            '<td style="padding:4px;">' + escapeHtml(parsed.items[r].name) + '</td>' +
                            '<td style="padding:4px;">' + escapeHtml(parsed.items[r].qty) + '</td>' +
                            '<td style="padding:4px;text-align:right;font-weight:600;">' + escapeHtml(parsed.items[r].total) + ' €</td></tr>';
                }
                html += '</tbody></table>';
                tblWrap.innerHTML = html;
            }
        }
    }

    async function openZugferdModal() {
        var doc = getActiveDoc();
        if (!doc) {
            await createNewBlankPdfTab();
            doc = getActiveDoc();
        }
        openModal('modalZugferd');
        var xmlStr = await findZugferdXmlInDocument(doc);
        renderZugferdDataInModal(xmlStr);
    }

    function buildZugferdFacturXXmlString() {
        var invNum = (document.getElementById('zfGenInvNumber').value || 'RE-2026-1001').trim();
        var rawDate = (document.getElementById('zfGenInvDate').value || '2026-11-04').replace(/-/g, '');
        var leitweg = (document.getElementById('zfGenLeitweg').value || '991-00000-00').trim();
        var seller = (document.getElementById('zfGenSeller').value || 'Muster Organisation').trim();
        var buyer = (document.getElementById('zfGenBuyer').value || 'Rechnungsempfänger').trim();
        var iban = (document.getElementById('zfGenIban').value || 'DE00000000000000000000').replace(/\s+/g, '');
        var net = parseFloat(document.getElementById('zfGenNet').value) || 100.0;
        var taxRate = parseFloat(document.getElementById('zfGenTaxRate').value) || 19.0;
        var taxAmt = Math.round(net * (taxRate / 100) * 100) / 100;
        var gross = Math.round((net + taxAmt) * 100) / 100;

        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"\n' +
            '    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"\n' +
            '    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">\n' +
            '  <rsm:ExchangedDocumentContext>\n' +
            '    <ram:GuidelineSpecifiedDocumentContextParameter>\n' +
            '      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>\n' +
            '    </ram:GuidelineSpecifiedDocumentContextParameter>\n' +
            '  </rsm:ExchangedDocumentContext>\n' +
            '  <rsm:ExchangedDocument>\n' +
            '    <ram:ID>' + escapeXmlAttr(invNum) + '</ram:ID>\n' +
            '    <ram:TypeCode>380</ram:TypeCode>\n' +
            '    <ram:IssueDateTime><udt:DateTimeString format="102">' + escapeXmlAttr(rawDate) + '</udt:DateTimeString></ram:IssueDateTime>\n' +
            '  </rsm:ExchangedDocument>\n' +
            '  <rsm:SupplyChainTradeTransaction>\n' +
            '    <ram:IncludedSupplyChainTradeLineItem>\n' +
            '      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>\n' +
            '      <ram:SpecifiedTradeProduct><ram:Name>Rechnungsposition (' + escapeXmlAttr(invNum) + ')</ram:Name></ram:SpecifiedTradeProduct>\n' +
            '      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">1.00</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>\n' +
            '      <ram:SpecifiedLineTradeSettlement>\n' +
            '        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>' + net.toFixed(2) + '</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>\n' +
            '      </ram:SpecifiedLineTradeSettlement>\n' +
            '    </ram:IncludedSupplyChainTradeLineItem>\n' +
            '    <ram:ApplicableHeaderTradeAgreement>\n' +
            '      <ram:BuyerReference>' + escapeXmlAttr(leitweg) + '</ram:BuyerReference>\n' +
            '      <ram:SellerTradeParty><ram:Name>' + escapeXmlAttr(seller) + '</ram:Name></ram:SellerTradeParty>\n' +
            '      <ram:BuyerTradeParty><ram:Name>' + escapeXmlAttr(buyer) + '</ram:Name></ram:BuyerTradeParty>\n' +
            '    </ram:ApplicableHeaderTradeAgreement>\n' +
            '    <ram:ApplicableHeaderTradeDelivery/>\n' +
            '    <ram:ApplicableHeaderTradeSettlement>\n' +
            '      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>\n' +
            '      <ram:SpecifiedTradeSettlementPaymentMeans>\n' +
            '        <ram:TypeCode>58</ram:TypeCode>\n' +
            '        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>' + escapeXmlAttr(iban) + '</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>\n' +
            '      </ram:SpecifiedTradeSettlementPaymentMeans>\n' +
            '      <ram:ApplicableTradeTax>\n' +
            '        <ram:CalculatedAmount>' + taxAmt.toFixed(2) + '</ram:CalculatedAmount>\n' +
            '        <ram:TypeCode>VAT</ram:TypeCode>\n' +
            '        <ram:BasisAmount>' + net.toFixed(2) + '</ram:BasisAmount>\n' +
            '        <ram:CategoryCode>S</ram:CategoryCode>\n' +
            '        <ram:RateApplicablePercent>' + taxRate.toFixed(2) + '</ram:RateApplicablePercent>\n' +
            '      </ram:ApplicableTradeTax>\n' +
            '      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n' +
            '        <ram:LineTotalAmount>' + net.toFixed(2) + '</ram:LineTotalAmount>\n' +
            '        <ram:TaxBasisTotalAmount>' + net.toFixed(2) + '</ram:TaxBasisTotalAmount>\n' +
            '        <ram:TaxTotalAmount currencyID="EUR">' + taxAmt.toFixed(2) + '</ram:TaxTotalAmount>\n' +
            '        <ram:GrandTotalAmount>' + gross.toFixed(2) + '</ram:GrandTotalAmount>\n' +
            '        <ram:DuePayableAmount>' + gross.toFixed(2) + '</ram:DuePayableAmount>\n' +
            '      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n' +
            '    </ram:ApplicableHeaderTradeSettlement>\n' +
            '  </rsm:SupplyChainTradeTransaction>\n' +
            '</rsm:CrossIndustryInvoice>\n';
    }

    async function embedZugferdXmlIntoActivePdf() {
        var doc = getActiveDoc();
        if (!doc) return;
        await bakeAnnotationsIntoDocument(doc);

        var xmlString = buildZugferdFacturXXmlString();
        var xmlBytes = new TextEncoder().encode(xmlString);

        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var context = pdfDoc.context;
        var catalog = pdfDoc.catalog;

        var efStream = context.flateStream(xmlBytes, {
            Type: 'EmbeddedFile',
            Subtype: 'text/xml',
            Params: context.obj({
                Size: xmlBytes.length,
                ModDate: PDFLib.PDFString.of('D:20261104120000Z')
            })
        });
        var efStreamRef = context.register(efStream);

        var fileSpec = context.obj({
            Type: 'Filespec',
            F: PDFLib.PDFString.of('factur-x.xml'),
            UF: PDFLib.PDFHexString.fromText('factur-x.xml'),
            Desc: PDFLib.PDFString.of('Factur-X / ZUGFeRD 2.2 EN 16931 E-Rechnung'),
            AFRelationship: PDFLib.PDFName.of('Alternative'),
            EF: context.obj({
                F: efStreamRef,
                UF: efStreamRef
            })
        });
        var fileSpecRef = context.register(fileSpec);

        var embeddedFilesTree = context.obj({
            Names: [PDFLib.PDFString.of('factur-x.xml'), fileSpecRef]
        });
        catalog.set(PDFLib.PDFName.of('Names'), context.obj({
            EmbeddedFiles: embeddedFilesTree
        }));
        catalog.set(PDFLib.PDFName.of('AF'), context.obj([fileSpecRef]));

        doc.bytes = await pdfDoc.save({ useObjectStreams: false });
        doc.modified = true;
        renderTabsBar();
        renderZugferdDataInModal(xmlString);
        trackUsageEvent('zugferd_used');
        showToast('ZUGFeRD 2.2 / Factur-X (factur-x.xml) erfolgreich in das PDF eingebettet!', 'success');
    }

    // =========================================================================
    // 4. 100% Offline QR-Code Generator (ISO/IEC 18004 Byte Mode + Reed-Solomon)
    // =========================================================================
    function generateQrCodeMatrix(text) {
        var utf8 = Array.from(new TextEncoder().encode(String(text || 'https://runready.cloud')));
        // Capacities for ECC Level L (Byte Mode, Versions 1..10)
        var vTable = [
            null,
            { ver: 1, totalCodewords: 26, ecCodewordsPerBlock: 7, blocks: 1, align: [] },
            { ver: 2, totalCodewords: 44, ecCodewordsPerBlock: 10, blocks: 1, align: [6, 18] },
            { ver: 3, totalCodewords: 70, ecCodewordsPerBlock: 15, blocks: 1, align: [6, 22] },
            { ver: 4, totalCodewords: 100, ecCodewordsPerBlock: 20, blocks: 1, align: [6, 26] },
            { ver: 5, totalCodewords: 134, ecCodewordsPerBlock: 26, blocks: 1, align: [6, 30] },
            { ver: 6, totalCodewords: 172, ecCodewordsPerBlock: 18, blocks: 2, align: [6, 34] },
            { ver: 7, totalCodewords: 196, ecCodewordsPerBlock: 20, blocks: 2, align: [6, 22, 38] },
            { ver: 8, totalCodewords: 242, ecCodewordsPerBlock: 24, blocks: 2, align: [6, 24, 42] },
            { ver: 9, totalCodewords: 292, ecCodewordsPerBlock: 30, blocks: 2, align: [6, 26, 46] }
        ];

        var spec = vTable[9];
        for (var v = 1; v <= 9; v++) {
            var dataCap = vTable[v].totalCodewords - vTable[v].ecCodewordsPerBlock * vTable[v].blocks;
            var headerBytes = v >= 10 ? 3 : 2;
            if (utf8.length + headerBytes <= dataCap) {
                spec = vTable[v];
                break;
            }
        }
        var maxBytes = (spec.totalCodewords - spec.ecCodewordsPerBlock * spec.blocks) - 2;
        if (utf8.length > maxBytes) utf8 = utf8.slice(0, maxBytes);

        var dataCapWords = spec.totalCodewords - spec.ecCodewordsPerBlock * spec.blocks;
        var bits = [];
        function pushBits(val, len) {
            for (var b = len - 1; b >= 0; b--) bits.push((val >>> b) & 1);
        }
        pushBits(0x4, 4); // Byte mode
        pushBits(utf8.length, 8);
        for (var i = 0; i < utf8.length; i++) pushBits(utf8[i], 8);
        var maxBits = dataCapWords * 8;
        pushBits(0, Math.min(4, maxBits - bits.length));
        while (bits.length % 8 !== 0) bits.push(0);

        var codewords = [];
        for (var bi = 0; bi < bits.length; bi += 8) {
            var byteVal = 0;
            for (var k = 0; k < 8; k++) byteVal = (byteVal << 1) | bits[bi + k];
            codewords.push(byteVal);
        }
        var padBytes = [0xEC, 0x11];
        var pIdx = 0;
        while (codewords.length < dataCapWords) {
            codewords.push(padBytes[pIdx % 2]);
            pIdx++;
        }

        // GF(256) tables
        var gfExp = new Array(512);
        var gfLog = new Array(256);
        var x = 1;
        for (var gi = 0; gi < 255; gi++) {
            gfExp[gi] = x;
            gfLog[x] = gi;
            x <<= 1;
            if (x & 0x100) x ^= 0x11D;
        }
        for (var gj = 255; gj < 512; gj++) gfExp[gj] = gfExp[gj - 255];
        function gfMul(a, b) {
            if (a === 0 || b === 0) return 0;
            return gfExp[gfLog[a] + gfLog[b]];
        }
        function rsGeneratorPoly(degree) {
            var poly = [1];
            for (var d = 0; d < degree; d++) {
                var next = new Array(poly.length + 1).fill(0);
                for (var pi = 0; pi < poly.length; pi++) {
                    next[pi] ^= poly[pi];
                    next[pi + 1] ^= gfMul(poly[pi], gfExp[d]);
                }
                poly = next;
            }
            return poly;
        }
        function rsEncode(dataWords, ecLen) {
            var gen = rsGeneratorPoly(ecLen);
            var rem = new Array(ecLen).fill(0);
            for (var di = 0; di < dataWords.length; di++) {
                var factor = dataWords[di] ^ rem[0];
                rem.shift();
                rem.push(0);
                if (factor !== 0) {
                    for (var j = 0; j < ecLen; j++) {
                        rem[j] ^= gfMul(gen[j + 1], factor);
                    }
                }
            }
            return rem;
        }

        var dataBlocks = [];
        var ecBlocks = [];
        var wordsPerBlock = Math.floor(dataCapWords / spec.blocks);
        var offset = 0;
        for (var blk = 0; blk < spec.blocks; blk++) {
            var blkData = codewords.slice(offset, offset + wordsPerBlock);
            offset += wordsPerBlock;
            dataBlocks.push(blkData);
            ecBlocks.push(rsEncode(blkData, spec.ecCodewordsPerBlock));
        }

        var finalBytes = [];
        for (var wi = 0; wi < wordsPerBlock; wi++) {
            for (var b1 = 0; b1 < spec.blocks; b1++) finalBytes.push(dataBlocks[b1][wi]);
        }
        for (var ei = 0; ei < spec.ecCodewordsPerBlock; ei++) {
            for (var b2 = 0; b2 < spec.blocks; b2++) finalBytes.push(ecBlocks[b2][ei]);
        }

        var size = spec.ver * 4 + 17;
        var modules = [];
        var isFunc = [];
        for (var r = 0; r < size; r++) {
            modules.push(new Array(size).fill(false));
            isFunc.push(new Array(size).fill(false));
        }

        function setFunc(row, col, dark) {
            if (row < 0 || row >= size || col < 0 || col >= size) return;
            modules[row][col] = Boolean(dark);
            isFunc[row][col] = true;
        }

        function drawFinder(row, col) {
            for (var dy = -1; dy <= 7; dy++) {
                for (var dx = -1; dx <= 7; dx++) {
                    var dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
                    setFunc(row + dy, col + dx, dist !== 2 && dist !== 4);
                }
            }
        }
        drawFinder(0, 0);
        drawFinder(0, size - 7);
        drawFinder(size - 7, 0);

        for (var ti = 8; ti < size - 8; ti++) {
            setFunc(6, ti, ti % 2 === 0);
            setFunc(ti, 6, ti % 2 === 0);
        }

        var al = spec.align;
        for (var ay = 0; ay < al.length; ay++) {
            for (var ax = 0; ax < al.length; ax++) {
                if ((ay === 0 && ax === 0) || (ay === 0 && ax === al.length - 1) || (ay === al.length - 1 && ax === 0)) continue;
                var cy = al[ay], cx = al[ax];
                for (var ddy = -2; ddy <= 2; ddy++) {
                    for (var ddx = -2; ddx <= 2; ddx++) {
                        setFunc(cy + ddy, cx + ddx, Math.max(Math.abs(ddx), Math.abs(ddy)) !== 1);
                    }
                }
            }
        }

        // Reserve format areas
        for (var fi = 0; fi <= 8; fi++) {
            if (fi !== 6) {
                setFunc(8, fi, false);
                setFunc(fi, 8, false);
            }
        }
        for (var fj = 0; fj < 8; fj++) {
            setFunc(8, size - 1 - fj, false);
            setFunc(size - 1 - fj, 8, false);
        }
        setFunc(size - 8, 8, true);

        // Place data bits (upward/downward 2-column zig-zag)
        var bitIdx = 0;
        var totalBits = finalBytes.length * 8;
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var vert = 0; vert < size; vert++) {
                var upward = ((right + 1) & 2) === 0;
                var y = upward ? (size - 1 - vert) : vert;
                for (var lr = 0; lr < 2; lr++) {
                    var xCol = right - lr;
                    if (!isFunc[y][xCol]) {
                        var darkBit = false;
                        if (bitIdx < totalBits) {
                            darkBit = ((finalBytes[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
                            bitIdx++;
                        }
                        // Mask 0: (y + xCol) % 2 === 0
                        if ((y + xCol) % 2 === 0) darkBit = !darkBit;
                        modules[y][xCol] = darkBit;
                    }
                }
            }
        }

        // Format info for ECC Level L (01) + Mask 0 (000) -> precomputed BCH 0x77C4
        var fmtBits = 0x77C4;
        for (var fb = 0; fb <= 5; fb++) setFunc(8, fb, ((fmtBits >>> fb) & 1) !== 0);
        setFunc(8, 7, ((fmtBits >>> 6) & 1) !== 0);
        setFunc(8, 8, ((fmtBits >>> 7) & 1) !== 0);
        setFunc(7, 8, ((fmtBits >>> 8) & 1) !== 0);
        for (var fb2 = 9; fb2 < 15; fb2++) setFunc(14 - fb2, 8, ((fmtBits >>> fb2) & 1) !== 0);
        for (var fb3 = 0; fb3 < 8; fb3++) setFunc(8, size - 1 - fb3, ((fmtBits >>> fb3) & 1) !== 0);
        for (var fb4 = 8; fb4 < 15; fb4++) setFunc(size - 15 + fb4, 8, ((fmtBits >>> fb4) & 1) !== 0);
        setFunc(size - 8, 8, true);

        return modules;
    }

    function renderQrPreviewCanvas() {
        var canvas = document.getElementById('qrPreviewCanvas');
        if (!canvas) return null;
        var payload = (document.getElementById('qrPayloadInput') && document.getElementById('qrPayloadInput').value) || 'https://runready.cloud';
        var color = (document.getElementById('qrColorSelect') && document.getElementById('qrColorSelect').value) || '#000000';
        var caption = (document.getElementById('qrCaptionInput') && document.getElementById('qrCaptionInput').value || '').trim();

        var matrix = generateQrCodeMatrix(payload);
        var mSize = matrix.length;
        var quiet = 3;
        var scale = 6;
        var qrPx = (mSize + quiet * 2) * scale;
        var capHeight = caption ? 24 : 0;

        canvas.width = qrPx;
        canvas.height = qrPx + capHeight;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = color;
        for (var r = 0; r < mSize; r++) {
            for (var c = 0; c < mSize; c++) {
                if (matrix[r][c]) {
                    ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
                }
            }
        }

        if (caption) {
            ctx.fillStyle = color;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(caption, canvas.width / 2, qrPx + 15, canvas.width - 8);
        }
        return canvas.toDataURL('image/png');
    }

    async function openQrCodeModal() {
        var doc = getActiveDoc();
        if (!doc) {
            await createNewBlankPdfTab();
        }
        openModal('modalQrCode');
        renderQrPreviewCanvas();
    }

    async function insertQrCodeIntoActivePage() {
        var doc = getActiveDoc();
        if (!doc) return;
        var dataUrl = renderQrPreviewCanvas();
        if (!dataUrl) return;

        var boxSize = parseInt((document.getElementById('qrSizeSelect') && document.getElementById('qrSizeSelect').value) || '105', 10);
        var caption = (document.getElementById('qrCaptionInput') && document.getElementById('qrCaptionInput').value || '').trim();
        var boxHeight = caption ? Math.round(boxSize * 1.14) : boxSize;

        var img = new Image();
        img.onload = function () {
            pushUndoState(doc);
            var anns = getPageAnnotations(doc, doc.currentPage);
            anns.push({
                type: 'image',
                x: 60,
                y: 60,
                w: boxSize,
                h: boxHeight,
                dataUrl: dataUrl,
                imgElement: img
            });
            state.selectedAnnotationIndex = anns.length - 1;
            doc.modified = true;
            closeModal('modalQrCode');
            if (state.viewMode !== 'editor') {
                switchView('editor');
            } else {
                redrawAnnotationOverlay();
            }
            renderTabsBar();
            trackUsageEvent('qrcode_inserted');
            showToast('QR-Code eingefügt! Sie können ihn mit der Maus frei verschieben.', 'success');
        };
        img.src = dataUrl;
    }

    // =========================================================================
    // v1.4.0 FEATURE 1: Intelligente Mustersuche & Auto-Schwärzung (DSGVO)
    // =========================================================================
    var autoRedactMatchesCache = [];

    async function openAutoRedactModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }
        openModal('modalAutoRedact');
        await scanPdfForAutoRedactPatterns();
    }

    async function scanPdfForAutoRedactPatterns() {
        var doc = getActiveDoc();
        var listEl = document.getElementById('arMatchesList');
        var titleEl = document.getElementById('arResultsTitle');
        if (!doc || !listEl) return;

        listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px 0;">⏳ Durchsuche alle Seiten des PDFs nach sensiblen Mustern…</div>';
        autoRedactMatchesCache = [];

        var patterns = [];
        if (document.getElementById('arPatIban') && document.getElementById('arPatIban').checked) {
            patterns.push({ label: 'IBAN', rx: /\b[A-Z]{2}\d{2}(?:\s?[0-9A-Z]{4}){3,7}(?:\s?[0-9A-Z]{1,3})?\b/g });
        }
        if (document.getElementById('arPatEmail') && document.getElementById('arPatEmail').checked) {
            patterns.push({ label: 'E-Mail', rx: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g });
        }
        if (document.getElementById('arPatPhone') && document.getElementById('arPatPhone').checked) {
            patterns.push({ label: 'Telefon', rx: /(?:(?:\+|00)49|0)\s?[1-9][\d\s\/\-]{6,16}\d/g });
        }
        if (document.getElementById('arPatDate') && document.getElementById('arPatDate').checked) {
            patterns.push({ label: 'Datum', rx: /\b(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}\b/g });
        }
        if (document.getElementById('arPatTaxId') && document.getElementById('arPatTaxId').checked) {
            patterns.push({ label: 'ID/AZ', rx: /\b(?:\d{2}\s?\d{3}\s?\d{3}\s?\d{3}|[A-Z]{1,4}[\-\/]\d{2,6}[\-\/]\d{1,6})\b/g });
        }

        var customRaw = (document.getElementById('arCustomTerms') && document.getElementById('arCustomTerms').value) || '';
        customRaw.split(',').forEach(function (term) {
            var clean = term.trim();
            if (clean.length >= 2) {
                var escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                patterns.push({ label: 'Begriff', rx: new RegExp(escaped, 'gi') });
            }
        });

        if (patterns.length === 0) {
            listEl.innerHTML = '<div style="color:#f87171;padding:8px 0;">Bitte wählen Sie mindestens ein Suchmuster aus oder geben Sie einen Suchbegriff ein.</div>';
            return;
        }

        try {
            var pdfProxy = await pdfjsLib.getDocument({ data: doc.bytes.slice(0) }).promise;
            for (var p = 1; p <= pdfProxy.numPages; p++) {
                var page = await pdfProxy.getPage(p);
                var vp = page.getViewport({ scale: 1.0 });
                var tc = await page.getTextContent();
                var items = tc.items || [];

                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    var str = String(it.str || '');
                    if (!str.trim()) continue;

                    var tx = it.transform ? it.transform[4] : 0;
                    var ty = it.transform ? it.transform[5] : 0;
                    var fontH = Math.max(10, Math.abs(it.height || (it.transform ? it.transform[0] : 12)));
                    var itemW = Math.max(fontH * 0.6, it.width || (str.length * fontH * 0.52));

                    for (var patIdx = 0; patIdx < patterns.length; patIdx++) {
                        var pat = patterns[patIdx];
                        pat.rx.lastIndex = 0;
                        var m;
                        while ((m = pat.rx.exec(str)) !== null) {
                            var matchText = m[0];
                            var startRatio = str.length > 0 ? (m.index / str.length) : 0;
                            var lenRatio = str.length > 0 ? (matchText.length / str.length) : 1;

                            var rxX = tx + itemW * startRatio - 2;
                            var rxW = Math.max(18, itemW * lenRatio + 4);
                            var rxY = (vp.height - ty - fontH * 0.88) - 2;
                            var rxH = fontH * 1.18 + 3;

                            autoRedactMatchesCache.push({
                                pageIndex: p - 1,
                                label: pat.label,
                                text: matchText,
                                x: Math.max(0, Math.round(rxX)),
                                y: Math.max(0, Math.round(rxY)),
                                w: Math.round(rxW),
                                h: Math.round(rxH),
                                selected: true
                            });
                            if (m.index === pat.rx.lastIndex) pat.rx.lastIndex++;
                        }
                    }
                }
            }
        } catch (err) {
            listEl.innerHTML = '<div style="color:#f87171;padding:8px 0;">Fehler bei der Textanalyse: ' + escapeHtml(err.message || String(err)) + '</div>';
            return;
        }

        if (titleEl) {
            titleEl.textContent = 'Gefundene Treffer (' + autoRedactMatchesCache.length + ')';
        }
        renderAutoRedactMatchesList();
    }

    function renderAutoRedactMatchesList() {
        var listEl = document.getElementById('arMatchesList');
        if (!listEl) return;
        if (autoRedactMatchesCache.length === 0) {
            listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px 0;">✔ Keine sensiblen Muster für die aktuelle Auswahl gefunden.</div>';
            return;
        }
        var html = '';
        autoRedactMatchesCache.forEach(function (item, idx) {
            html += '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg-app);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;">' +
                '<input type="checkbox" class="ar-match-cb" data-idx="' + idx + '" ' + (item.selected ? 'checked' : '') + '>' +
                '<span style="background:rgba(239,68,68,0.18);color:#fca5a5;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700;">' + escapeHtml(item.label) + '</span>' +
                '<strong style="font-family:monospace;">' + escapeHtml(item.text) + '</strong>' +
                '<span style="margin-left:auto;color:var(--text-muted);font-size:11px;">Seite ' + (item.pageIndex + 1) + '</span>' +
                '</label>';
        });
        listEl.innerHTML = html;

        var cbs = listEl.querySelectorAll('.ar-match-cb');
        cbs.forEach(function (cb) {
            cb.addEventListener('change', function () {
                var i = parseInt(cb.getAttribute('data-idx'), 10);
                if (autoRedactMatchesCache[i]) autoRedactMatchesCache[i].selected = cb.checked;
            });
        });
    }

    async function applySelectedAutoRedactMatches(burnImmediately) {
        var doc = getActiveDoc();
        if (!doc) return;
        var chosen = autoRedactMatchesCache.filter(function (m) { return m.selected; });
        if (chosen.length === 0) {
            showToast('Bitte wählen Sie mindestens einen Treffer aus.', 'error');
            return;
        }
        pushUndoState(doc);
        chosen.forEach(function (m) {
            var anns = getPageAnnotations(doc, m.pageIndex);
            anns.push({
                type: 'redact',
                x: m.x,
                y: m.y,
                w: m.w,
                h: m.h,
                color: '#000000'
            });
        });
        doc.modified = true;
        closeModal('modalAutoRedact');
        trackUsageEvent('auto_redact_pattern');

        if (burnImmediately) {
            await sanitizeRedactedPages();
        } else {
            doc.currentPage = chosen[0].pageIndex;
            if (state.viewMode !== 'editor') {
                await switchView('editor');
            } else {
                await renderCurrentEditorPage();
            }
            renderTabsBar();
            showToast(chosen.length + ' Schwärzungsbalken automatisch gesetzt! Klicken Sie auf "🛡️ Sanitize", um sie dauerhaft einzubrennen.', 'success');
        }
    }

    // =========================================================================
    // v1.4.0 FEATURE 3: PDF-Anlagen / Eingebettete Dateien verwalten (Portfolio)
    // =========================================================================
    var currentPdfAttachments = [];

    async function openAttachmentsModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }
        openModal('modalAttachments');
        await refreshPdfAttachmentsList();
    }

    async function refreshPdfAttachmentsList() {
        var doc = getActiveDoc();
        var listEl = document.getElementById('pdfAttachmentsList');
        if (!doc || !listEl) return;

        currentPdfAttachments = [];
        try {
            var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var context = pdfDoc.context;
            var catalog = pdfDoc.catalog;
            var namesDict = catalog.lookupMaybe(PDFLib.PDFName.of('Names'), PDFLib.PDFDict);
            if (namesDict) {
                var efTree = namesDict.lookupMaybe(PDFLib.PDFName.of('EmbeddedFiles'), PDFLib.PDFDict);
                if (efTree) {
                    var namesArr = efTree.lookupMaybe(PDFLib.PDFName.of('Names'), PDFLib.PDFArray);
                    if (namesArr) {
                        for (var i = 0; i + 1 < namesArr.size(); i += 2) {
                            var nameObj = context.lookup(namesArr.get(i));
                            var fsDict = context.lookup(namesArr.get(i + 1));
                            var fname = (nameObj && nameObj.decodeText) ? nameObj.decodeText() : ('Anlage_' + (i / 2 + 1));
                            if (fsDict && fsDict instanceof PDFLib.PDFDict) {
                                var ufObj = fsDict.lookupMaybe(PDFLib.PDFName.of('UF'), PDFLib.PDFHexString) || fsDict.lookupMaybe(PDFLib.PDFName.of('F'), PDFLib.PDFString);
                                if (ufObj && ufObj.decodeText) fname = ufObj.decodeText();
                                var efDict = fsDict.lookupMaybe(PDFLib.PDFName.of('EF'), PDFLib.PDFDict);
                                if (efDict) {
                                    var streamRef = efDict.get(PDFLib.PDFName.of('UF')) || efDict.get(PDFLib.PDFName.of('F'));
                                    var streamObj = context.lookup(streamRef);
                                    if (streamObj && streamObj.contents) {
                                        var rawBytes = streamObj.contents;
                                        var decodedBytes = rawBytes;
                                        var filterObj = streamObj.dict ? streamObj.dict.get(PDFLib.PDFName.of('Filter')) : null;
                                        if (filterObj && String(filterObj).indexOf('FlateDecode') !== -1 && typeof DecompressionStream !== 'undefined') {
                                            try {
                                                var ds = new DecompressionStream('deflate');
                                                var writer = ds.writable.getWriter();
                                                writer.write(rawBytes);
                                                writer.close();
                                                var ab = await new Response(ds.readable).arrayBuffer();
                                                decodedBytes = new Uint8Array(ab);
                                            } catch (e2) {}
                                        }
                                        currentPdfAttachments.push({
                                            name: fname,
                                            bytes: decodedBytes,
                                            size: decodedBytes.byteLength
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {}

        if (currentPdfAttachments.length === 0) {
            listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px 0;">Keine eingebetteten Dateianlagen in diesem PDF gefunden. Klicken Sie oben auf „➕ Datei(en) in dieses PDF einbetten…“, um beliebige Dokumente anzuhängen.</div>';
            return;
        }

        var html = '';
        currentPdfAttachments.forEach(function (att, idx) {
            var kb = (att.size / 1024).toFixed(1) + ' KB';
            html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-app);border:1px solid var(--border-subtle);border-radius:6px;">' +
                '<span style="font-size:16px;">📎</span>' +
                '<div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                '<strong>' + escapeHtml(att.name) + '</strong> <span style="color:var(--text-muted);font-size:11px;">(' + kb + ')</span>' +
                '</div>' +
                '<button type="button" class="tool-btn btn-dl-att" data-idx="' + idx + '" style="height:26px;font-size:11.5px;">💾 Speichern</button>' +
                '<button type="button" class="tool-btn btn-del-att" data-idx="' + idx + '" style="height:26px;font-size:11.5px;color:#f87171;">🗑</button>' +
                '</div>';
        });
        listEl.innerHTML = html;

        listEl.querySelectorAll('.btn-dl-att').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                var att = currentPdfAttachments[i];
                if (att) {
                    downloadBlob(att.bytes, att.name, 'application/octet-stream');
                }
            });
        });
        listEl.querySelectorAll('.btn-del-att').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                await removeAttachmentByIndex(i);
            });
        });
    }

    async function embedFilesIntoActivePdf(fileList) {
        var doc = getActiveDoc();
        if (!doc || !fileList || fileList.length === 0) return;

        pushUndoState(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        for (var i = 0; i < fileList.length; i++) {
            var f = fileList[i];
            var buf = await f.arrayBuffer();
            await pdfDoc.attach(new Uint8Array(buf), f.name, {
                mimeType: f.type || 'application/octet-stream',
                description: 'Eingebettete Anlage: ' + f.name,
                creationDate: new Date(),
                modificationDate: new Date()
            });
        }
        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        renderTabsBar();
        trackUsageEvent('attachments_managed');
        await refreshPdfAttachmentsList();
        showToast(fileList.length + ' Dateianlage(n) erfolgreich in das PDF eingebettet!', 'success');
    }

    async function removeAttachmentByIndex(removeIdx) {
        var doc = getActiveDoc();
        if (!doc) return;
        var remaining = currentPdfAttachments.filter(function (_, idx) { return idx !== removeIdx; });
        pushUndoState(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var namesDict = pdfDoc.catalog.lookupMaybe(PDFLib.PDFName.of('Names'), PDFLib.PDFDict);
        if (namesDict) {
            namesDict.delete(PDFLib.PDFName.of('EmbeddedFiles'));
        }
        pdfDoc.catalog.delete(PDFLib.PDFName.of('AF'));
        for (var i = 0; i < remaining.length; i++) {
            await pdfDoc.attach(remaining[i].bytes, remaining[i].name, {
                mimeType: 'application/octet-stream',
                description: remaining[i].name
            });
        }
        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        renderTabsBar();
        await refreshPdfAttachmentsList();
        showToast('Anlage aus dem PDF entfernt.', 'success');
    }

    // =========================================================================
    // v1.4.0 FEATURE 4: Lesezeichen-Editor & Inhaltsverzeichnis-Deckblatt
    // =========================================================================
    var workingBookmarksList = [];

    async function openBookmarksModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }
        if (!doc.customBookmarks || !Array.isArray(doc.customBookmarks) || doc.customBookmarks.length === 0) {
            await autoDetectBookmarksFromPdf(true);
        } else {
            workingBookmarksList = JSON.parse(JSON.stringify(doc.customBookmarks));
            renderBookmarksEditorUI();
        }
        openModal('modalBookmarks');
    }

    async function autoDetectBookmarksFromPdf(silentInit) {
        var doc = getActiveDoc();
        if (!doc) return;
        workingBookmarksList = [];
        try {
            var pdfProxy = await pdfjsLib.getDocument({ data: doc.bytes.slice(0) }).promise;
            for (var p = 1; p <= pdfProxy.numPages; p++) {
                var page = await pdfProxy.getPage(p);
                var tc = await page.getTextContent();
                var items = tc.items || [];
                var foundOnPage = 0;
                for (var i = 0; i < items.length; i++) {
                    var str = String(items[i].str || '').trim();
                    if (str.length < 3 || str.length > 95) continue;
                    var fontH = Math.abs(items[i].height || (items[i].transform ? items[i].transform[0] : 11));
                    if (fontH >= 13.5 && foundOnPage < 3) {
                        workingBookmarksList.push({
                            title: str,
                            page: p,
                            level: fontH >= 17 ? 1 : 2
                        });
                        foundOnPage++;
                    }
                }
                if (foundOnPage === 0 && pdfProxy.numPages <= 30) {
                    workingBookmarksList.push({
                        title: 'Seite ' + p,
                        page: p,
                        level: 1
                    });
                }
            }
        } catch (err) {}

        if (workingBookmarksList.length === 0) {
            workingBookmarksList.push({ title: doc.meta.title || 'Kapitel 1', page: 1, level: 1 });
        }
        renderBookmarksEditorUI();
        if (!silentInit) {
            showToast(workingBookmarksList.length + ' Lesezeichen aus Dokumentstruktur erkannt.', 'success');
        }
    }

    function renderBookmarksEditorUI() {
        var container = document.getElementById('bookmarksEditorList');
        if (!container) return;
        if (workingBookmarksList.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);padding:8px;">Noch keine Lesezeichen angelegt. Klicken Sie auf „➕ Lesezeichen hinzufügen“.</div>';
            return;
        }
        var doc = getActiveDoc();
        var maxPage = doc ? doc.pageCount : 999;
        var html = '';
        workingBookmarksList.forEach(function (bm, idx) {
            html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--bg-app);border:1px solid var(--border-subtle);border-radius:6px;">' +
                '<select class="form-control bm-level-sel" data-idx="' + idx + '" style="width:92px;height:28px;font-size:11.5px;">' +
                '<option value="1" ' + (bm.level === 1 ? 'selected' : '') + '>Ebene 1</option>' +
                '<option value="2" ' + (bm.level === 2 ? 'selected' : '') + '>↳ Ebene 2</option>' +
                '</select>' +
                '<input type="text" class="form-control bm-title-inp" data-idx="' + idx + '" value="' + escapeHtml(bm.title) + '" placeholder="Kapiteltitel" style="flex:1;height:28px;font-size:12px;">' +
                '<span style="font-size:11.5px;color:var(--text-muted);">Seite:</span>' +
                '<input type="number" class="form-control bm-page-inp" data-idx="' + idx + '" value="' + (bm.page || 1) + '" min="1" max="' + maxPage + '" style="width:64px;height:28px;font-size:12px;">' +
                '<button type="button" class="tool-btn bm-del-btn" data-idx="' + idx + '" style="height:28px;padding:0 8px;color:#f87171;">✕</button>' +
                '</div>';
        });
        container.innerHTML = html;

        container.querySelectorAll('.bm-level-sel').forEach(function (el) {
            el.addEventListener('change', function () {
                var i = parseInt(el.getAttribute('data-idx'), 10);
                if (workingBookmarksList[i]) workingBookmarksList[i].level = parseInt(el.value, 10) || 1;
            });
        });
        container.querySelectorAll('.bm-title-inp').forEach(function (el) {
            el.addEventListener('input', function () {
                var i = parseInt(el.getAttribute('data-idx'), 10);
                if (workingBookmarksList[i]) workingBookmarksList[i].title = el.value;
            });
        });
        container.querySelectorAll('.bm-page-inp').forEach(function (el) {
            el.addEventListener('input', function () {
                var i = parseInt(el.getAttribute('data-idx'), 10);
                if (workingBookmarksList[i]) workingBookmarksList[i].page = Math.max(1, parseInt(el.value, 10) || 1);
            });
        });
        container.querySelectorAll('.bm-del-btn').forEach(function (el) {
            el.addEventListener('click', function () {
                var i = parseInt(el.getAttribute('data-idx'), 10);
                workingBookmarksList.splice(i, 1);
                renderBookmarksEditorUI();
            });
        });
    }

    async function saveBookmarksAndTocToActivePdf() {
        var doc = getActiveDoc();
        if (!doc) return;
        var validBms = workingBookmarksList.filter(function (b) { return String(b.title || '').trim() !== ''; });
        if (validBms.length === 0) {
            showToast('Bitte legen Sie mindestens ein Lesezeichen mit Titel an.', 'error');
            return;
        }

        var insertToc = document.getElementById('bmInsertTocPage') && document.getElementById('bmInsertTocPage').checked;
        var tocTitle = (document.getElementById('bmTocTitleInput') && document.getElementById('bmTocTitleInput').value.trim()) || 'Inhaltsverzeichnis';

        pushUndoState(doc);
        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var fontReg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        var fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        var pageOffset = 0;
        if (insertToc) {
            var firstPage = pdfDoc.getPages()[0];
            var sz = firstPage ? firstPage.getSize() : { width: 595.28, height: 841.89 };
            var tocPage = pdfDoc.insertPage(0, [sz.width, sz.height]);
            pageOffset = 1;

            var yCursor = sz.height - 65;
            tocPage.drawText(tocTitle, {
                x: 52,
                y: yCursor,
                size: 20,
                font: fontBold,
                color: PDFLib.rgb(0.08, 0.15, 0.28)
            });
            yCursor -= 10;
            tocPage.drawLine({
                start: { x: 52, y: yCursor },
                end: { x: sz.width - 52, y: yCursor },
                thickness: 1.5,
                color: PDFLib.rgb(0.23, 0.51, 0.96)
            });
            yCursor -= 26;

            for (var bi = 0; bi < validBms.length; bi++) {
                if (yCursor < 60) break;
                var entry = validBms[bi];
                var targetPageNum = entry.page + pageOffset;
                var indentX = entry.level === 2 ? 70 : 52;
                var entryFont = entry.level === 1 ? fontBold : fontReg;
                var entrySize = entry.level === 1 ? 11.5 : 10.5;
                var cleanTitle = String(entry.title).substring(0, 72);

                tocPage.drawText(cleanTitle, {
                    x: indentX,
                    y: yCursor,
                    size: entrySize,
                    font: entryFont,
                    color: PDFLib.rgb(0.12, 0.16, 0.22)
                });
                var pgStr = String(targetPageNum);
                var pgW = entryFont.widthOfTextAtSize(pgStr, entrySize);
                tocPage.drawText(pgStr, {
                    x: sz.width - 52 - pgW,
                    y: yCursor,
                    size: entrySize,
                    font: entryFont,
                    color: PDFLib.rgb(0.23, 0.51, 0.96)
                });
                yCursor -= (entry.level === 1 ? 20 : 17);
            }
        }

        // Build PDF /Outlines dictionary tree
        var context = pdfDoc.context;
        var pages = pdfDoc.getPages();
        var outlinesDictRef = context.nextRef();
        var itemRefs = validBms.map(function () { return context.nextRef(); });

        for (var idx = 0; idx < validBms.length; idx++) {
            var bmItem = validBms[idx];
            var targetIdx = Math.max(0, Math.min(pages.length - 1, (bmItem.page - 1) + pageOffset));
            var pageRef = pages[targetIdx].ref;

            var destArr = context.obj([pageRef, PDFLib.PDFName.of('XYZ'), null, null, null]);
            var itemMap = {
                Title: PDFLib.PDFHexString.fromText(String(bmItem.title)),
                Parent: outlinesDictRef,
                Dest: destArr
            };
            if (idx > 0) itemMap.Prev = itemRefs[idx - 1];
            if (idx + 1 < validBms.length) itemMap.Next = itemRefs[idx + 1];
            context.assign(itemRefs[idx], context.obj(itemMap));
        }

        context.assign(outlinesDictRef, context.obj({
            Type: PDFLib.PDFName.of('Outlines'),
            First: itemRefs[0],
            Last: itemRefs[itemRefs.length - 1],
            Count: PDFLib.PDFNumber.of(itemRefs.length)
        }));
        pdfDoc.catalog.set(PDFLib.PDFName.of('Outlines'), outlinesDictRef);
        pdfDoc.catalog.set(PDFLib.PDFName.of('PageMode'), PDFLib.PDFName.of('UseOutlines'));

        doc.customBookmarks = validBms.map(function (b) {
            return { title: b.title, page: b.page + pageOffset, level: b.level };
        });
        doc.bytes = await pdfDoc.save();
        doc.pageCount = pages.length;
        doc.modified = true;

        closeModal('modalBookmarks');
        await reloadActiveDocAfterPageMutation(doc);
        trackUsageEvent('bookmarks_toc_used');
        showToast(validBms.length + ' Lesezeichen' + (insertToc ? ' + Inhaltsverzeichnis-Deckblatt' : '') + ' erfolgreich ins PDF übernommen!', 'success');
    }

    // =========================================================================
    // v1.4.0 FEATURE 5: Metadaten- & Forensik-Bereinigung (Sanitize PDF)
    // =========================================================================
    async function openSanitizeMetaModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }
        openModal('modalSanitizeMeta');
        var repEl = document.getElementById('sanitizeForensicReport');
        if (!repEl) return;

        try {
            var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var author = pdfDoc.getAuthor() || '—';
            var creator = pdfDoc.getCreator() || '—';
            var producer = pdfDoc.getProducer() || '—';
            var hasXmp = pdfDoc.catalog.get(PDFLib.PDFName.of('Metadata')) ? 'Ja (XMP-XML-Stream vorhanden)' : 'Nein';
            var hasOpenAction = pdfDoc.catalog.get(PDFLib.PDFName.of('OpenAction')) ? '⚠️ Ja (OpenAction vorhanden)' : 'Nein';

            repEl.innerHTML =
                '<div><strong>Gefundene Dokument-Spuren im aktuellen PDF:</strong></div>' +
                '<div>• <strong>Autor (Author):</strong> ' + escapeHtml(author) + '</div>' +
                '<div>• <strong>Erstellt mit (Creator):</strong> ' + escapeHtml(creator) + '</div>' +
                '<div>• <strong>PDF-Konverter (Producer):</strong> ' + escapeHtml(producer) + '</div>' +
                '<div>• <strong>XMP-Metadaten-Historie:</strong> ' + hasXmp + '</div>' +
                '<div>• <strong>Automatische Start-Aktionen:</strong> ' + hasOpenAction + '</div>';
        } catch (err) {
            repEl.textContent = 'Dokument bereit zur Bereinigung.';
        }
    }

    async function runSanitizeMetadataAndTraces() {
        var doc = getActiveDoc();
        if (!doc) return;
        pushUndoState(doc);

        var clearInfoXmp = document.getElementById('sanOptInfoXmp') && document.getElementById('sanOptInfoXmp').checked;
        var clearScripts = document.getElementById('sanOptScripts') && document.getElementById('sanOptScripts').checked;
        var clearAtts    = document.getElementById('sanOptAttachments') && document.getElementById('sanOptAttachments').checked;
        var clearAnns    = document.getElementById('sanOptAnnotations') && document.getElementById('sanOptAnnotations').checked;

        if (clearAnns) {
            await bakeAnnotationsIntoDocument(doc);
        }

        var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });

        if (clearInfoXmp) {
            pdfDoc.setAuthor('');
            pdfDoc.setCreator('');
            pdfDoc.setProducer('PDF-Werkstatt Pro');
            pdfDoc.setSubject('');
            pdfDoc.setKeywords([]);
            pdfDoc.setCreationDate(new Date(0));
            pdfDoc.setModificationDate(new Date(0));
            pdfDoc.catalog.delete(PDFLib.PDFName.of('Metadata'));
            pdfDoc.catalog.delete(PDFLib.PDFName.of('PieceInfo'));
            doc.meta.author = '';
            doc.meta.subject = '';
        }

        if (clearScripts) {
            pdfDoc.catalog.delete(PDFLib.PDFName.of('OpenAction'));
            pdfDoc.catalog.delete(PDFLib.PDFName.of('AA'));
            var namesDict = pdfDoc.catalog.lookupMaybe(PDFLib.PDFName.of('Names'), PDFLib.PDFDict);
            if (namesDict) {
                namesDict.delete(PDFLib.PDFName.of('JavaScript'));
            }
            var pages = pdfDoc.getPages();
            for (var p = 0; p < pages.length; p++) {
                pages[p].node.delete(PDFLib.PDFName.of('AA'));
            }
        }

        if (clearAtts) {
            var namesDict2 = pdfDoc.catalog.lookupMaybe(PDFLib.PDFName.of('Names'), PDFLib.PDFDict);
            if (namesDict2) {
                namesDict2.delete(PDFLib.PDFName.of('EmbeddedFiles'));
            }
            pdfDoc.catalog.delete(PDFLib.PDFName.of('AF'));
        }

        if (clearAnns) {
            try {
                var form = pdfDoc.getForm();
                form.flatten();
            } catch (e) {}
            var pages2 = pdfDoc.getPages();
            for (var p2 = 0; p2 < pages2.length; p2++) {
                pages2[p2].node.delete(PDFLib.PDFName.of('Annots'));
            }
        }

        doc.bytes = await pdfDoc.save();
        doc.modified = true;
        populateMetadataInspector(doc);
        renderTabsBar();
        closeModal('modalSanitizeMeta');
        trackUsageEvent('metadata_sanitized');
        showToast('Forensik- & Metadaten-Bereinigung erfolgreich durchgeführt!', 'success');
    }

    // =========================================================================
    // v1.4.0 FEATURE 6: Mehrseiten-Layout (N-up: 2-auf-1, 4-auf-1 & Broschüre)
    // =========================================================================
    async function openNupBookletModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }
        openModal('modalNupBooklet');
    }

    async function runNupOrBookletLayout() {
        var doc = getActiveDoc();
        if (!doc) return;

        await bakeAnnotationsIntoDocument(doc);
        var mode = (document.getElementById('nupLayoutMode') && document.getElementById('nupLayoutMode').value) || '2up';
        var margin = Math.max(0, parseInt((document.getElementById('nupPageMargin') && document.getElementById('nupPageMargin').value) || '18', 10));
        var drawBorder = document.getElementById('nupDrawBorder') && document.getElementById('nupDrawBorder').checked;
        var drawFold = document.getElementById('nupDrawFoldLine') && document.getElementById('nupDrawFoldLine').checked;

        var srcDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
        var srcPages = srcDoc.getPages();
        var total = srcPages.length;
        if (total === 0) return;

        var outDoc = await PDFLib.PDFDocument.create();
        var embeddedPages = await outDoc.embedPages(srcPages);

        function placeCell(outPage, embPage, cellX, cellY, cellW, cellH) {
            if (!embPage) return;
            var pad = margin;
            var availW = Math.max(20, cellW - pad * 2);
            var availH = Math.max(20, cellH - pad * 2);
            var scale = Math.min(availW / embPage.width, availH / embPage.height);
            var drawW = embPage.width * scale;
            var drawH = embPage.height * scale;
            var dx = cellX + (cellW - drawW) / 2;
            var dy = cellY + (cellH - drawH) / 2;

            outPage.drawPage(embPage, { x: dx, y: dy, width: drawW, height: drawH });
            if (drawBorder) {
                outPage.drawRectangle({
                    x: dx,
                    y: dy,
                    width: drawW,
                    height: drawH,
                    borderColor: PDFLib.rgb(0.75, 0.78, 0.82),
                    borderWidth: 0.6
                });
            }
        }

        if (mode === '2up') {
            var sheetW = 841.89, sheetH = 595.28; // A4 Landscape
            for (var i = 0; i < total; i += 2) {
                var sh = outDoc.addPage([sheetW, sheetH]);
                placeCell(sh, embeddedPages[i], 0, 0, sheetW / 2, sheetH);
                if (i + 1 < total) {
                    placeCell(sh, embeddedPages[i + 1], sheetW / 2, 0, sheetW / 2, sheetH);
                }
                if (drawFold) {
                    sh.drawLine({
                        start: { x: sheetW / 2, y: 15 },
                        end: { x: sheetW / 2, y: sheetH - 15 },
                        thickness: 0.5,
                        color: PDFLib.rgb(0.8, 0.82, 0.85)
                    });
                }
            }
        } else if (mode === '4up') {
            var sheetW4 = 595.28, sheetH4 = 841.89; // A4 Portrait
            var cw = sheetW4 / 2, ch = sheetH4 / 2;
            for (var j = 0; j < total; j += 4) {
                var sh4 = outDoc.addPage([sheetW4, sheetH4]);
                placeCell(sh4, embeddedPages[j],     0,  ch, cw, ch);
                placeCell(sh4, embeddedPages[j + 1], cw, ch, cw, ch);
                placeCell(sh4, embeddedPages[j + 2], 0,  0,  cw, ch);
                placeCell(sh4, embeddedPages[j + 3], cw, 0,  cw, ch);
                if (drawFold) {
                    sh4.drawLine({ start: { x: cw, y: 15 }, end: { x: cw, y: sheetH4 - 15 }, thickness: 0.4, color: PDFLib.rgb(0.82, 0.84, 0.87) });
                    sh4.drawLine({ start: { x: 15, y: ch }, end: { x: sheetW4 - 15, y: ch }, thickness: 0.4, color: PDFLib.rgb(0.82, 0.84, 0.87) });
                }
            }
        } else if (mode === 'booklet') {
            var bSheetW = 841.89, bSheetH = 595.28; // A4 Landscape saddle-stitch
            var paddedTotal = Math.ceil(total / 4) * 4;
            var sheetsCount = paddedTotal / 4;
            for (var s = 0; s < sheetsCount; s++) {
                // Front side of sheet: Left = paddedTotal - 1 - 2*s, Right = 2*s
                var frontLeftIdx  = paddedTotal - 1 - (2 * s);
                var frontRightIdx = 2 * s;
                var frontPage = outDoc.addPage([bSheetW, bSheetH]);
                placeCell(frontPage, embeddedPages[frontLeftIdx] || null, 0, 0, bSheetW / 2, bSheetH);
                placeCell(frontPage, embeddedPages[frontRightIdx] || null, bSheetW / 2, 0, bSheetW / 2, bSheetH);
                if (drawFold) {
                    frontPage.drawLine({ start: { x: bSheetW / 2, y: 10 }, end: { x: bSheetW / 2, y: bSheetH - 10 }, thickness: 0.5, color: PDFLib.rgb(0.78, 0.8, 0.84) });
                }

                // Back side of sheet: Left = 2*s + 1, Right = paddedTotal - 2 - 2*s
                var backLeftIdx  = 2 * s + 1;
                var backRightIdx = paddedTotal - 2 - (2 * s);
                var backPage = outDoc.addPage([bSheetW, bSheetH]);
                placeCell(backPage, embeddedPages[backLeftIdx] || null, 0, 0, bSheetW / 2, bSheetH);
                placeCell(backPage, embeddedPages[backRightIdx] || null, bSheetW / 2, 0, bSheetW / 2, bSheetH);
                if (drawFold) {
                    backPage.drawLine({ start: { x: bSheetW / 2, y: 10 }, end: { x: bSheetW / 2, y: bSheetH - 10 }, thickness: 0.5, color: PDFLib.rgb(0.78, 0.8, 0.84) });
                }
            }
        }

        var outBytes = await outDoc.save();
        var suffix = mode === 'booklet' ? '_Broschuere.pdf' : ('_' + mode + '.pdf');
        var newName = doc.name.replace(/\.pdf$/i, '') + suffix;
        closeModal('modalNupBooklet');
        await addDocumentTab(newName, outBytes, 'editor');
        trackUsageEvent('nup_booklet_created');
        showToast('Mehrseiten-Layout "' + newName + '" als neuer Tab geöffnet!', 'success');
    }

    // =========================================================================
    // v1.4.0 FEATURE 7: Formulardaten-Export & Serienbrief-Befüllung (CSV/Excel)
    // =========================================================================
    var currentDetectedFormFields = [];

    async function openMailMergeModal() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Formular oder Dokument.', 'error');
            return;
        }
        openModal('modalMailMerge');
        await inspectActivePdfFormFields();
    }

    async function inspectActivePdfFormFields() {
        var doc = getActiveDoc();
        var boxEl = document.getElementById('mmDetectedFieldsBox');
        if (!doc || !boxEl) return;

        currentDetectedFormFields = [];
        var seenNames = {};

        // 1. Check studio annotations first
        Object.keys(doc.annotations || {}).forEach(function (pIdx) {
            var list = doc.annotations[pIdx] || [];
            list.forEach(function (ann) {
                if (ann.type === 'form-text' || ann.type === 'form-check' || ann.type === 'form-select') {
                    var fname = ann.fieldName || ('Feld_' + (currentDetectedFormFields.length + 1));
                    if (!seenNames[fname]) {
                        seenNames[fname] = true;
                        currentDetectedFormFields.push({
                            name: fname,
                            type: ann.type,
                            value: ann.type === 'form-check' ? (ann.checked ? 'Ja' : 'Nein') : (ann.value || '')
                        });
                    }
                }
            });
        });

        // 2. Check native AcroForm fields in PDF
        try {
            var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var form = pdfDoc.getForm();
            var fields = form.getFields();
            fields.forEach(function (f) {
                var fname = f.getName();
                if (seenNames[fname]) return;
                seenNames[fname] = true;
                var val = '';
                var fType = f.constructor ? f.constructor.name : 'Field';
                try {
                    if (typeof f.getText === 'function') val = f.getText() || '';
                    else if (typeof f.isChecked === 'function') val = f.isChecked() ? 'Ja' : 'Nein';
                    else if (typeof f.getSelected === 'function') val = (f.getSelected() || []).join(', ');
                } catch (e2) {}
                currentDetectedFormFields.push({
                    name: fname,
                    type: fType,
                    value: val
                });
            });
        } catch (err) {}

        if (currentDetectedFormFields.length === 0) {
            boxEl.innerHTML = '<span style="color:var(--text-muted);">Keine interaktiven Formularfelder im geöffneten PDF gefunden. Tipp: Sie können im Reiter „📋 Formulare &amp; Links“ Textfelder, Checkboxen oder Dropdowns anlegen.</span>';
            return;
        }

        var html = '<div style="margin-bottom:4px;"><strong>Erkannte Formularfelder (' + currentDetectedFormFields.length + '):</strong></div>';
        currentDetectedFormFields.forEach(function (ff) {
            html += '<div style="display:flex;justify-content:space-between;border-bottom:1px dashed var(--border-subtle);padding:2px 0;">' +
                '<code>' + escapeHtml(ff.name) + '</code>' +
                '<span style="color:var(--text-secondary);">' + escapeHtml(ff.value || '—') + '</span>' +
                '</div>';
        });
        boxEl.innerHTML = html;
    }

    function exportActiveFormFieldsCsv(blankTemplate) {
        var doc = getActiveDoc();
        if (!doc) return;
        if (currentDetectedFormFields.length === 0) {
            showToast('Dieses PDF enthält noch keine Formularfelder.', 'error');
            return;
        }
        var headers = currentDetectedFormFields.map(function (f) {
            return '"' + String(f.name).replace(/"/g, '""') + '"';
        });
        var values = currentDetectedFormFields.map(function (f) {
            var v = blankTemplate ? '' : String(f.value || '');
            return '"' + v.replace(/"/g, '""') + '"';
        });
        var csvContent = '\uFEFF' + headers.join(';') + '\r\n' + values.join(';') + '\r\n';
        var outName = doc.name.replace(/\.pdf$/i, '') + (blankTemplate ? '_Serienbrief_Vorlage.csv' : '_Formulardaten.csv');
        downloadBlob(csvContent, outName, 'text/csv;charset=utf-8');
        trackUsageEvent('form_mailmerge_used');
        showToast('CSV-Datei "' + outName + '" heruntergeladen!', 'success');
    }

    function exportActiveFormFieldsJson() {
        var doc = getActiveDoc();
        if (!doc) return;
        if (currentDetectedFormFields.length === 0) {
            showToast('Dieses PDF enthält noch keine Formularfelder.', 'error');
            return;
        }
        var obj = {};
        currentDetectedFormFields.forEach(function (f) { obj[f.name] = f.value; });
        var outName = doc.name.replace(/\.pdf$/i, '') + '_Formulardaten.json';
        downloadBlob(JSON.stringify(obj, null, 2), outName, 'application/json;charset=utf-8');
        trackUsageEvent('form_mailmerge_used');
        showToast('JSON-Formulardaten heruntergeladen!', 'success');
    }

    function parseCsvTextToObjects(csvText) {
        var lines = String(csvText || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
        if (lines.length < 2) return [];
        var sep = lines[0].indexOf(';') !== -1 ? ';' : ',';
        function splitCsvRow(rowStr) {
            var res = [], cur = '', inQ = false;
            for (var i = 0; i < rowStr.length; i++) {
                var ch = rowStr[i];
                if (ch === '"') {
                    if (inQ && rowStr[i + 1] === '"') { cur += '"'; i++; }
                    else inQ = !inQ;
                } else if (ch === sep && !inQ) {
                    res.push(cur.trim());
                    cur = '';
                } else {
                    cur += ch;
                }
            }
            res.push(cur.trim());
            return res;
        }
        var headers = splitCsvRow(lines[0]);
        var rows = [];
        for (var r = 1; r < lines.length; r++) {
            var cols = splitCsvRow(lines[r]);
            var rowObj = {};
            headers.forEach(function (h, idx) {
                if (h) rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
            });
            rows.push(rowObj);
        }
        return rows;
    }

    async function runMailMergeFromUploadedTable() {
        var doc = getActiveDoc();
        var fileInp = document.getElementById('mmCsvFileInput');
        var statusEl = document.getElementById('mmStatusBox');
        if (!doc || !fileInp || !fileInp.files || fileInp.files.length === 0) {
            showToast('Bitte wählen Sie zuerst eine CSV- oder Excel-Datei (.csv / .xlsx) aus.', 'error');
            return;
        }

        await bakeAnnotationsIntoDocument(doc);
        var file = fileInp.files[0];
        var rows = [];
        try {
            if (/\.xlsx?$/i.test(file.name) && typeof XLSX !== 'undefined') {
                var ab = await file.arrayBuffer();
                var wb = XLSX.read(ab, { type: 'array' });
                var firstSheet = wb.Sheets[wb.SheetNames[0]];
                rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            } else {
                var txt = await file.text();
                rows = parseCsvTextToObjects(txt);
            }
        } catch (err) {
            showToast('Tabellendatei konnte nicht gelesen werden: ' + (err.message || err), 'error');
            return;
        }

        if (!rows || rows.length === 0) {
            showToast('Die gewählte Tabelle enthält keine Datenzeilen.', 'error');
            return;
        }

        var flattenOut = document.getElementById('mmFlattenFilledPdfs') && document.getElementById('mmFlattenFilledPdfs').checked;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = 'rgba(59,130,246,0.14)';
            statusEl.style.color = '#93c5fd';
            statusEl.textContent = '⏳ Erzeuge ' + rows.length + ' Serienbrief-PDF(s)…';
        }

        var zip = new JSZip();
        var baseName = doc.name.replace(/\.pdf$/i, '');

        for (var rIdx = 0; rIdx < rows.length; rIdx++) {
            var rowData = rows[rIdx];
            var pdfCopy = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            try {
                var form = pdfCopy.getForm();
                var fields = form.getFields();
                fields.forEach(function (f) {
                    var fname = f.getName();
                    var matchedKey = Object.keys(rowData).find(function (k) {
                        return k.trim().toLowerCase() === fname.trim().toLowerCase();
                    });
                    if (matchedKey !== undefined) {
                        var val = String(rowData[matchedKey] !== undefined ? rowData[matchedKey] : '');
                        try {
                            if (typeof f.setText === 'function') {
                                f.setText(val);
                            } else if (typeof f.check === 'function') {
                                if (/^(1|true|ja|yes|x|on)$/i.test(val.trim())) f.check();
                                else if (typeof f.uncheck === 'function') f.uncheck();
                            } else if (typeof f.select === 'function' && val) {
                                f.select(val);
                            }
                        } catch (e3) {}
                    }
                });
                if (flattenOut) {
                    form.flatten();
                }
            } catch (eForm) {}

            var pdfBytes = await pdfCopy.save();
            var suffix = String(rIdx + 1).padStart(3, '0');
            zip.file(baseName + '_' + suffix + '.pdf', pdfBytes);
        }

        var zipBlob = await zip.generateAsync({ type: 'blob' });
        var zipUrl = URL.createObjectURL(zipBlob);
        var a = document.createElement('a');
        a.href = zipUrl;
        a.download = baseName + '_Serienbrief_' + rows.length + '_PDFs.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(zipUrl); }, 3000);

        if (statusEl) {
            statusEl.style.background = 'rgba(16,185,129,0.14)';
            statusEl.style.color = '#6ee7b7';
            statusEl.textContent = '✔ ' + rows.length + ' ausgefüllte PDF-Dateien erfolgreich als ZIP heruntergeladen!';
        }
        trackUsageEvent('form_mailmerge_used');
        showToast(rows.length + ' Serienbrief-PDFs erfolgreich als ZIP erstellt!', 'success');
    }

    // =========================================================================
    // 8. Cryptographic Digital PDF Signatures (PKCS#7 / SHA-256 / PAdES & .p12)
    // =========================================================================
    function switchDigitalCertTab(tabName) {
        var panes = {
            sign: document.getElementById('certPaneSign'),
            verify: document.getElementById('certPaneVerify'),
            create: document.getElementById('certPaneCreate')
        };
        var btns = {
            sign: document.getElementById('btnCertTabSign'),
            verify: document.getElementById('btnCertTabVerify'),
            create: document.getElementById('btnCertTabCreate')
        };
        Object.keys(panes).forEach(function (k) {
            if (panes[k]) {
                if (k === tabName) panes[k].classList.remove('hidden');
                else panes[k].classList.add('hidden');
            }
            if (btns[k]) {
                if (k === tabName) btns[k].classList.add('btn-primary');
                else btns[k].classList.remove('btn-primary');
            }
        });
        var signBtnFooter = document.getElementById('btnExecuteCertSignPdf');
        if (signBtnFooter) {
            signBtnFooter.style.display = (tabName === 'sign') ? 'inline-flex' : 'none';
        }
        if (tabName === 'verify') {
            verifyActivePdfDigitalSignatures();
        }
    }

    async function openDigitalCertSignModal(initialTab) {
        var doc = getActiveDoc();
        if (!doc) {
            await createNewBlankPdfTab();
            doc = getActiveDoc();
        }
        if (state.user) {
            var qCn = document.getElementById('certQuickCn');
            var qOrg = document.getElementById('certQuickOrg');
            var gCn = document.getElementById('genP12Cn');
            var gOrg = document.getElementById('genP12Org');
            if (qCn && !qCn.value.trim()) qCn.value = state.user.display_name || state.user.username || '';
            if (gCn && !gCn.value.trim()) gCn.value = state.user.display_name || state.user.username || '';
            if (state.user.profile && state.user.profile.organization) {
                if (qOrg && !qOrg.value.trim()) qOrg.value = state.user.profile.organization;
                if (gOrg && !gOrg.value.trim()) gOrg.value = state.user.profile.organization;
            }
        }
        var stBox = document.getElementById('certSignStatusBox');
        if (stBox) stBox.classList.add('hidden');

        openModal('modalDigitalCertSign');
        switchDigitalCertTab(initialTab || 'sign');
    }

    function sanitizeWinAnsiText(str) {
        return String(str || '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[„“”]/g, '"')
            .replace(/[–—]/g, '-')
            .replace(/€/g, 'EUR')
            .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    }

    function formatPdfDateNow() {
        var d = new Date();
        function pad2(n) { return String(n).padStart(2, '0'); }
        var tzMin = -d.getTimezoneOffset();
        var sign = tzMin >= 0 ? '+' : '-';
        var absMin = Math.abs(tzMin);
        var tzH = pad2(Math.floor(absMin / 60));
        var tzM = pad2(absMin % 60);
        return 'D:' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
            pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) +
            sign + tzH + "'" + tzM + "'";
    }

    function formatGermanDateTimeNow() {
        var d = new Date();
        function pad2(n) { return String(n).padStart(2, '0'); }
        return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
            pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function base64ToUint8Array(b64) {
        var binStr = window.atob(b64);
        var len = binStr.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binStr.charCodeAt(i);
        }
        return bytes;
    }

    async function executeCryptographicPdfSigning() {
        var doc = getActiveDoc();
        if (!doc) {
            showToast('Bitte öffnen Sie zuerst ein PDF-Dokument.', 'error');
            return;
        }

        var isP12Mode = document.getElementById('certModeP12Radio') && document.getElementById('certModeP12Radio').checked;
        var certMode = isP12Mode ? 'p12' : 'quick';
        var stBox = document.getElementById('certSignStatusBox');
        var btnSign = document.getElementById('btnExecuteCertSignPdf');

        function setCertSignStatus(html, type) {
            if (!stBox) return;
            stBox.classList.remove('hidden');
            if (type === 'error') {
                stBox.style.background = 'rgba(239,68,68,0.14)';
                stBox.style.border = '1px solid rgba(239,68,68,0.4)';
                stBox.style.color = '#fca5a5';
            } else if (type === 'success') {
                stBox.style.background = 'rgba(16,185,129,0.14)';
                stBox.style.border = '1px solid rgba(16,185,129,0.4)';
                stBox.style.color = '#6ee7b7';
            } else {
                stBox.style.background = 'rgba(59,130,246,0.14)';
                stBox.style.border = '1px solid rgba(59,130,246,0.4)';
                stBox.style.color = '#93c5fd';
            }
            stBox.innerHTML = html;
        }

        var quickCn = (document.getElementById('certQuickCn') && document.getElementById('certQuickCn').value.trim()) || '';
        var quickOrg = (document.getElementById('certQuickOrg') && document.getElementById('certQuickOrg').value.trim()) || '';
        var quickOu = (document.getElementById('certQuickOu') && document.getElementById('certQuickOu').value.trim()) || '';
        var quickEmail = (document.getElementById('certQuickEmail') && document.getElementById('certQuickEmail').value.trim()) || '';
        var exportP12 = document.getElementById('certQuickExportP12') && document.getElementById('certQuickExportP12').checked;
        var quickP12Pass = (document.getElementById('certQuickP12Pass') && document.getElementById('certQuickP12Pass').value) || '';

        var p12FileInp = document.getElementById('certP12FileInput');
        var p12PassInp = document.getElementById('certP12PasswordInput');

        if (certMode === 'quick') {
            if (!quickCn) {
                setCertSignStatus('✕ Bitte geben Sie den <strong>Namen des Unterzeichners (CN)</strong> ein.', 'error');
                return;
            }
        } else {
            if (!p12FileInp || !p12FileInp.files || p12FileInp.files.length === 0) {
                setCertSignStatus('✕ Bitte wählen Sie Ihre <strong><code>.p12</code>- oder <code>.pfx</code>-Zertifikatsdatei</strong> aus.', 'error');
                return;
            }
        }

        var pageMode = (document.getElementById('certStampPageMode') && document.getElementById('certStampPageMode').value) || 'current';
        var posMode = (document.getElementById('certStampPosition') && document.getElementById('certStampPosition').value) || 'bottom-right';
        var reasonStr = (document.getElementById('certSignReason') && document.getElementById('certSignReason').value.trim()) || 'Dokument geprüft und freigegeben';
        var locationStr = (document.getElementById('certSignLocation') && document.getElementById('certSignLocation').value.trim()) || 'Deutschland';
        var includeHandSig = document.getElementById('certIncludeHandSig') && document.getElementById('certIncludeHandSig').checked;

        if (btnSign) btnSign.disabled = true;
        setCertSignStatus('⏳ <strong>Schritt 1/2:</strong> Bereite offiziellen Signaturstempel &amp; PDF-Signaturfeld (<code>/Type /Sig</code>, <code>/AcroForm /SigFlags 3</code>) vor…', 'info');

        try {
            await bakeAnnotationsIntoDocument(doc);
            pushUndoState(doc);

            var pdfDoc = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var pages = pdfDoc.getPages();
            var targetIdx = doc.currentPage || 0;
            if (pageMode === 'first') targetIdx = 0;
            else if (pageMode === 'last') targetIdx = Math.max(0, pages.length - 1);
            targetIdx = Math.max(0, Math.min(pages.length - 1, targetIdx));

            var targetPage = pages[targetIdx];
            var sz = targetPage.getSize();
            var stampW = 240;
            var stampH = 78;
            var margin = 28;
            var rectX1 = sz.width - stampW - margin;
            var rectY1 = margin;

            if (posMode === 'bottom-left') {
                rectX1 = margin;
                rectY1 = margin;
            } else if (posMode === 'top-right') {
                rectX1 = sz.width - stampW - margin;
                rectY1 = sz.height - stampH - margin;
            } else if (posMode === 'top-left') {
                rectX1 = margin;
                rectY1 = sz.height - stampH - margin;
            }
            var rectX2 = rectX1 + stampW;
            var rectY2 = rectY1 + stampH;

            var signerDisplay = certMode === 'quick'
                ? quickCn
                : ((p12FileInp && p12FileInp.files[0]) ? p12FileInp.files[0].name.replace(/\.(p12|pfx)$/i, '') : 'Zertifikats-Inhaber');
            var nowFormatted = formatGermanDateTimeNow();

            if (posMode !== 'invisible') {
                var fontReg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                var fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

                // Card background & crisp border
                targetPage.drawRectangle({
                    x: rectX1,
                    y: rectY1,
                    width: stampW,
                    height: stampH,
                    color: PDFLib.rgb(0.95, 0.975, 1.0),
                    borderColor: PDFLib.rgb(0.15, 0.39, 0.92),
                    borderWidth: 1.2
                });

                // Top seal banner inside the stamp box
                targetPage.drawRectangle({
                    x: rectX1,
                    y: rectY2 - 15,
                    width: stampW,
                    height: 15,
                    color: PDFLib.rgb(0.15, 0.39, 0.92)
                });
                targetPage.drawText('DIGITAL SIGNIERT  |  PKCS#7 / SHA-256 SIEGEL', {
                    x: rectX1 + 7,
                    y: rectY2 - 10.5,
                    size: 7.2,
                    font: fontBold,
                    color: PDFLib.rgb(1, 1, 1)
                });

                var textLeftX = rectX1 + 8;
                if (includeHandSig && state.lastSignatureDataUrl && state.lastSignatureDataUrl.indexOf('data:image/png') === 0) {
                    try {
                        var sigImg = await pdfDoc.embedPng(state.lastSignatureDataUrl);
                        targetPage.drawImage(sigImg, {
                            x: rectX1 + 6,
                            y: rectY1 + 10,
                            width: 66,
                            height: 44
                        });
                        textLeftX = rectX1 + 76;
                    } catch (eImg) {}
                }

                var maxChars = textLeftX > (rectX1 + 20) ? 28 : 38;
                var lineY = rectY2 - 26;

                var l1 = sanitizeWinAnsiText('Unterzeichner: ' + signerDisplay).substring(0, maxChars);
                targetPage.drawText(l1, {
                    x: textLeftX,
                    y: lineY,
                    size: 7.8,
                    font: fontBold,
                    color: PDFLib.rgb(0.06, 0.12, 0.26)
                });
                lineY -= 11;

                if (quickOrg && certMode === 'quick') {
                    var lOrg = sanitizeWinAnsiText('Organisation: ' + quickOrg).substring(0, maxChars);
                    targetPage.drawText(lOrg, {
                        x: textLeftX,
                        y: lineY,
                        size: 7.2,
                        font: fontReg,
                        color: PDFLib.rgb(0.15, 0.22, 0.34)
                    });
                    lineY -= 10.5;
                }

                var lReason = sanitizeWinAnsiText('Grund: ' + reasonStr).substring(0, maxChars);
                targetPage.drawText(lReason, {
                    x: textLeftX,
                    y: lineY,
                    size: 7.0,
                    font: fontReg,
                    color: PDFLib.rgb(0.18, 0.25, 0.36)
                });
                lineY -= 10.5;

                var lDateLoc = sanitizeWinAnsiText('Datum: ' + nowFormatted + ' (' + locationStr + ')').substring(0, maxChars + 4);
                targetPage.drawText(lDateLoc, {
                    x: textLeftX,
                    y: lineY,
                    size: 6.8,
                    font: fontReg,
                    color: PDFLib.rgb(0.25, 0.32, 0.45)
                });
            }

            // Build cryptographic /Sig dictionary & /Widget annotation with /ByteRange & /Contents placeholders
            var context = pdfDoc.context;
            var sigDictRef = context.nextRef();
            var placeholderHex = new Array(16384 + 1).join('0');

            var sigDictMap = {
                Type: PDFLib.PDFName.of('Sig'),
                Filter: PDFLib.PDFName.of('Adobe.PPKLite'),
                SubFilter: PDFLib.PDFName.of('adbe.pkcs7.detached'),
                Name: PDFLib.PDFString.of(sanitizeWinAnsiText(signerDisplay || 'Unterzeichner')),
                Reason: PDFLib.PDFString.of(sanitizeWinAnsiText(reasonStr)),
                Location: PDFLib.PDFString.of(sanitizeWinAnsiText(locationStr)),
                M: PDFLib.PDFString.of(formatPdfDateNow()),
                ByteRange: context.obj([0, 1000000000, 1000000000, 1000000000]),
                Contents: PDFLib.PDFHexString.of(placeholderHex)
            };
            context.assign(sigDictRef, context.obj(sigDictMap));

            // Create valid Form XObject appearance stream (/AP /N) so Adobe Acrobat validates widget appearance
            var apXObj = context.flateStream('', {
                Type: PDFLib.PDFName.of('XObject'),
                Subtype: PDFLib.PDFName.of('Form'),
                FormType: PDFLib.PDFNumber.of(1),
                BBox: context.obj([0, 0, posMode === 'invisible' ? 0 : stampW, posMode === 'invisible' ? 0 : stampH]),
                Matrix: context.obj([1, 0, 0, 1, 0, 0]),
                Resources: context.obj({})
            });
            var apRef = context.register(apXObj);

            var widgetRef = context.nextRef();
            var widgetRect = posMode === 'invisible' ? [0, 0, 0, 0] : [rectX1, rectY1, rectX2, rectY2];
            var widgetDict = context.obj({
                Type: PDFLib.PDFName.of('Annot'),
                Subtype: PDFLib.PDFName.of('Widget'),
                FT: PDFLib.PDFName.of('Sig'),
                Rect: context.obj(widgetRect),
                T: PDFLib.PDFString.of('SigField_' + Math.floor(Date.now() / 1000)),
                F: PDFLib.PDFNumber.of(132),
                P: targetPage.ref,
                V: sigDictRef,
                AP: context.obj({ N: apRef })
            });
            context.assign(widgetRef, widgetDict);

            // Attach widgetRef to target page /Annots
            var pageAnnots = targetPage.node.lookup(PDFLib.PDFName.of('Annots'));
            if (pageAnnots && typeof pageAnnots.push === 'function') {
                pageAnnots.push(widgetRef);
            } else {
                targetPage.node.set(PDFLib.PDFName.of('Annots'), context.obj([widgetRef]));
            }

            // Attach widgetRef to Catalog /AcroForm with /SigFlags 3 (SignaturesExist | AppendOnly)
            var acroForm = pdfDoc.catalog.lookup(PDFLib.PDFName.of('AcroForm'));
            if (acroForm && typeof acroForm.set === 'function') {
                var fieldsArr = acroForm.lookup(PDFLib.PDFName.of('Fields'));
                if (fieldsArr && typeof fieldsArr.push === 'function') {
                    fieldsArr.push(widgetRef);
                } else {
                    acroForm.set(PDFLib.PDFName.of('Fields'), context.obj([widgetRef]));
                }
                acroForm.set(PDFLib.PDFName.of('SigFlags'), PDFLib.PDFNumber.of(3));
            } else {
                pdfDoc.catalog.set(PDFLib.PDFName.of('AcroForm'), context.obj({
                    Fields: context.obj([widgetRef]),
                    SigFlags: PDFLib.PDFNumber.of(3)
                }));
            }

            // Save without object streams so /ByteRange and /Contents are written as plain ASCII
            var preparedBytes = await pdfDoc.save({ useObjectStreams: false });

            setCertSignStatus('⏳ <strong>Schritt 2/2:</strong> Berechne kryptografische RSA-2048 / SHA-256 Signatur (<code>PKCS#7 / CMS detached</code>) über <code>/ByteRange</code>…', 'info');

            var fd = new FormData();
            fd.append('csrf_token', window.PDFSTUDIO_CSRF_TOKEN || '');
            fd.append('pdf_file', new Blob([preparedBytes], { type: 'application/pdf' }), doc.name || 'dokument.pdf');
            fd.append('cert_mode', certMode);

            if (certMode === 'p12') {
                fd.append('p12_file', p12FileInp.files[0]);
                fd.append('p12_password', p12PassInp ? p12PassInp.value : '');
            } else {
                fd.append('cn', quickCn);
                fd.append('org', quickOrg);
                fd.append('ou', quickOu);
                fd.append('email', quickEmail);
                fd.append('export_p12', exportP12 ? '1' : '0');
                fd.append('p12_password', quickP12Pass);
            }

            var resp = await fetch('api.php?action=sign_pdf_cert', {
                method: 'POST',
                body: fd
            });
            var data = await resp.json();

            if (!data || !data.ok || !data.signed_pdf_base64) {
                setCertSignStatus('✕ <strong>Fehler beim Signieren:</strong> ' + escapeHtml((data && data.error) ? data.error : 'Unbekannter Fehler.'), 'error');
                return;
            }

            var signedBytes = base64ToUint8Array(data.signed_pdf_base64);
            doc.bytes = signedBytes;
            doc.annotations = {};
            doc.modified = false;

            await refreshDocumentViews();
            renderTabsBar();

            var signedName = doc.name.replace(/\.pdf$/i, '') + '_signiert.pdf';
            downloadBlob(signedBytes, signedName, 'application/pdf');

            if (data.p12_base64) {
                var p12Bytes = base64ToUint8Array(data.p12_base64);
                var safeCertName = (quickCn || 'Zertifikat').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.p12';
                downloadBlob(p12Bytes, safeCertName, 'application/x-pkcs12');
            }

            var cm = data.cert_meta || {};
            setCertSignStatus(
                '✔ <strong>PDF erfolgreich kryptografisch signiert &amp; heruntergeladen!</strong><br>' +
                '• <strong>Unterzeichner (CN):</strong> ' + escapeHtml(cm.cn || signerDisplay) + (cm.org ? ' (' + escapeHtml(cm.org) + ')' : '') + '<br>' +
                '• <strong>Algorithmus:</strong> RSA-2048 / SHA-256 (<code>adbe.pkcs7.detached</code>)<br>' +
                '• <strong>SHA-256 Zertifikats-Fingerabdruck:</strong> <code style="font-size:10.5px;word-break:break-all;">' + escapeHtml(cm.fingerprint_sha256 || '') + '</code><br>' +
                '• <strong>Hinweis für Adobe Acrobat:</strong> Das Dokument ist nun kryptografisch versiegelt. Jede nachträgliche Änderung am PDF bricht das Siegel sofort sichtbar.',
                'success'
            );
            showToast('PDF erfolgreich mit Zertifikat signiert (' + signedName + ')!', 'success');
        } catch (err) {
            setCertSignStatus('✕ <strong>Technischer Fehler:</strong> ' + escapeHtml(err.message || String(err)), 'error');
        } finally {
            if (btnSign) btnSign.disabled = false;
        }
    }

    async function verifyActivePdfDigitalSignatures() {
        var box = document.getElementById('certVerifyResultsBox');
        var doc = getActiveDoc();
        if (!box) return;
        if (!doc) {
            box.innerHTML = '<span style="color:var(--text-muted);">Bitte öffnen Sie zuerst ein PDF-Dokument.</span>';
            return;
        }

        box.innerHTML = '<span style="color:#93c5fd;">⏳ Prüfe PDF-Struktur auf eingebettete PKCS#7 / CMS / PAdES-Zertifikatssignaturen…</span>';
        try {
            var fd = new FormData();
            fd.append('csrf_token', window.PDFSTUDIO_CSRF_TOKEN || '');
            fd.append('pdf_file', new Blob([doc.bytes], { type: 'application/pdf' }), doc.name || 'dokument.pdf');

            var resp = await fetch('api.php?action=verify_pdf_cert', {
                method: 'POST',
                body: fd
            });
            var data = await resp.json();

            if (!data || !data.ok) {
                box.innerHTML = '<span style="color:#fca5a5;">✕ Fehler bei der Signaturprüfung: ' + escapeHtml((data && data.error) ? data.error : 'Unbekannter Fehler') + '</span>';
                return;
            }

            if (!data.signed || !data.signatures || data.signatures.length === 0) {
                box.innerHTML =
                    '<div style="padding:10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);border-radius:6px;color:#fcd34d;">' +
                    'ℹ️ <strong>Keine digitale Zertifikats-Signatur gefunden:</strong><br>' +
                    'Dieses PDF-Dokument enthält aktuell noch keine kryptografische Signatur (<code>/Type /Sig</code>). Wechseln Sie oben auf den Reiter <strong>„🔏 1. PDF digital unterschreiben“</strong>, um das Dokument jetzt mit einem Zertifikat zu versiegeln.' +
                    '</div>';
                return;
            }

            var html = '<div style="margin-bottom:10px;font-weight:700;color:var(--text-primary);">Gefundene digitale Zertifikats-Signaturen (' + data.signatures.length + '):</div>';
            data.signatures.forEach(function (sig) {
                var statusColor = sig.intact ? '#10b981' : '#ef4444';
                var statusBg = sig.intact ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
                var statusTitle = sig.intact
                    ? '✔ KRYPTOGRAFISCHE SIGNATUR GÜLTIG — DOKUMENT UNVERÄNDERT'
                    : '✕ WARNUNG: SIGNATUR UNGÜLTIG ODER DOKUMENT WURDE NACHTRÄGLICH VERÄNDERT!';

                html += '<div style="border:1px solid ' + statusColor + ';background:' + statusBg + ';border-radius:8px;padding:12px;margin-bottom:10px;">' +
                    '<div style="font-weight:800;font-size:13px;color:' + statusColor + ';margin-bottom:8px;">' + statusTitle + '</div>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px;font-size:12px;color:var(--text-primary);">' +
                    '<div><strong>Unterzeichner (CN):</strong> ' + escapeHtml(sig.signer_name || '—') + '</div>' +
                    '<div><strong>Organisation:</strong> ' + escapeHtml(sig.signer_org || '—') + (sig.signer_ou ? ' (' + escapeHtml(sig.signer_ou) + ')' : '') + '</div>' +
                    '<div><strong>E-Mail:</strong> ' + escapeHtml(sig.signer_email || '—') + '</div>' +
                    '<div><strong>Signatur-Zeitpunkt:</strong> ' + escapeHtml(sig.signing_time || '—') + '</div>' +
                    '<div><strong>Grund:</strong> ' + escapeHtml(sig.reason || '—') + '</div>' +
                    '<div><strong>Ort:</strong> ' + escapeHtml(sig.location || '—') + '</div>' +
                    '<div><strong>Aussteller:</strong> ' + escapeHtml(sig.issuer_cn || '—') + (sig.self_signed ? ' <em>(Selbstsigniertes Zertifikat)</em>' : '') + '</div>' +
                    '<div><strong>Zertifikat gültig:</strong> ' + escapeHtml(sig.valid_from || '?') + ' bis ' + escapeHtml(sig.valid_to || '?') + '</div>' +
                    '<div><strong>Hash- &amp; Signaturverfahren:</strong> <code>' + escapeHtml(sig.hash_algo) + ' / ' + escapeHtml(sig.subfilter) + '</code></div>' +
                    '<div><strong>Dokumenten-Abdeckung:</strong> ' + (sig.covers_whole_doc ? '<span style="color:#10b981;font-weight:700;">✔ Gesamtes PDF versiegelt</span>' : '<span style="color:#f59e0b;">⚠️ Nachträgliche Daten angehängt</span>') + '</div>' +
                    '</div>' +
                    (sig.fingerprint ? '<div style="margin-top:6px;font-size:11px;color:var(--text-secondary);"><strong>SHA-256 Fingerabdruck:</strong> <code style="word-break:break-all;">' + escapeHtml(sig.fingerprint) + '</code></div>' : '') +
                    '</div>';
            });
            box.innerHTML = html;
        } catch (err) {
            box.innerHTML = '<span style="color:#fca5a5;">✕ Verbindungsfehler bei der Signaturprüfung: ' + escapeHtml(err.message || String(err)) + '</span>';
        }
    }

    async function generateStandaloneP12Certificate() {
        var cn = (document.getElementById('genP12Cn') && document.getElementById('genP12Cn').value.trim()) || '';
        var org = (document.getElementById('genP12Org') && document.getElementById('genP12Org').value.trim()) || '';
        var ou = (document.getElementById('genP12Ou') && document.getElementById('genP12Ou').value.trim()) || '';
        var email = (document.getElementById('genP12Email') && document.getElementById('genP12Email').value.trim()) || '';
        var days = (document.getElementById('genP12Days') && document.getElementById('genP12Days').value) || '1095';
        var pass = (document.getElementById('genP12Pass') && document.getElementById('genP12Pass').value) || '';
        var stBox = document.getElementById('genP12StatusBox');
        var btn = document.getElementById('btnGenerateDownloadP12');

        function setGenStatus(html, isOk) {
            if (!stBox) return;
            stBox.classList.remove('hidden');
            stBox.style.background = isOk ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)';
            stBox.style.border = isOk ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.4)';
            stBox.style.color = isOk ? '#6ee7b7' : '#fca5a5';
            stBox.innerHTML = html;
        }

        if (!cn) {
            setGenStatus('✕ Bitte geben Sie Ihren vollständigen Namen (Common Name / CN) ein.', false);
            return;
        }
        if (pass.length < 4) {
            setGenStatus('✕ Bitte vergeben Sie ein Schutz-Passwort mit mindestens 4 Zeichen für Ihre .p12-Datei.', false);
            return;
        }

        if (btn) btn.disabled = true;
        try {
            var fd = new FormData();
            fd.append('csrf_token', window.PDFSTUDIO_CSRF_TOKEN || '');
            fd.append('cn', cn);
            fd.append('org', org);
            fd.append('ou', ou);
            fd.append('email', email);
            fd.append('days', days);
            fd.append('password', pass);

            var resp = await fetch('api.php?action=generate_p12_cert', {
                method: 'POST',
                body: fd
            });
            var data = await resp.json();
            if (!data || !data.ok || !data.p12_base64) {
                setGenStatus('✕ ' + escapeHtml((data && data.error) ? data.error : 'Zertifikat konnte nicht erzeugt werden.'), false);
                return;
            }

            var p12Bytes = base64ToUint8Array(data.p12_base64);
            downloadBlob(p12Bytes, data.filename || 'Signatur_Zertifikat.p12', 'application/x-pkcs12');

            var m = data.meta || {};
            setGenStatus(
                '✔ <strong>Persönliches Signatur-Zertifikat (<code>' + escapeHtml(data.filename || 'Zertifikat.p12') + '</code>) erfolgreich erstellt &amp; heruntergeladen!</strong><br>' +
                '• <strong>Gültigkeit:</strong> ' + escapeHtml(m.valid_from || '') + ' bis ' + escapeHtml(m.valid_to || '') + '<br>' +
                '• <strong>SHA-256 Fingerabdruck:</strong> <code style="font-size:10.5px;word-break:break-all;">' + escapeHtml(m.fingerprint_sha256 || '') + '</code><br>' +
                'Sie können diese <code>.p12</code>-Datei jederzeit unter „1. PDF digital unterschreiben“ oder in Adobe Acrobat verwenden.',
                true
            );
            showToast('Zertifikat ' + (data.filename || '.p12') + ' erfolgreich heruntergeladen!', 'success');
        } catch (err) {
            setGenStatus('✕ Verbindungsfehler beim Erstellen des Zertifikats.', false);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // =========================================================================
    // Event Listeners Setup
    // =========================================================================
    function initEventListeners() {
        // Top desktop menu bar dropdowns
        var menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(function (item) {
            var trigger = item.querySelector('.menu-trigger');
            trigger.addEventListener('click', function (e) {
                e.stopPropagation();
                var wasOpen = item.classList.contains('open');
                closeAllPopups();
                if (!wasOpen) item.classList.add('open');
            });
        });

        window.addEventListener('click', function () {
            closeAllPopups();
        });

        // Delegate all [data-cmd] buttons
        document.addEventListener('click', function (e) {
            var ribbonTab = e.target.closest('.ribbon-tab[data-ribbon]');
            if (ribbonTab) {
                switchRibbonTab(ribbonTab.getAttribute('data-ribbon'));
                return;
            }

            if (e.target.closest('#btnToggleRibbonDeck')) {
                var deck = document.getElementById('ribbonDeck');
                var btn = document.getElementById('btnToggleRibbonDeck');
                var isCol = deck.classList.toggle('collapsed');
                btn.textContent = isCol ? '▾' : '▴';
                return;
            }

            var cmdBtn = e.target.closest('[data-cmd]');
            if (cmdBtn) {
                e.stopPropagation();
                executeCommand(cmdBtn.getAttribute('data-cmd'));
                return;
            }

            var toolBtn = e.target.closest('.tool-btn[data-tool]');
            if (toolBtn) {
                var currentRibbon = document.querySelector('.ribbon-tab.active');
                var keepRibbon = currentRibbon ? currentRibbon.getAttribute('data-ribbon') : null;
                setActiveTool(toolBtn.getAttribute('data-tool'), toolBtn.getAttribute('data-tagtype'));
                if (state.viewMode !== 'editor') {
                    switchView('editor');
                    if (keepRibbon) switchRibbonTab(keepRibbon);
                }
                return;
            }

            var dockTab = e.target.closest('.dock-tab[data-docktab]');
            if (dockTab) {
                switchLeftDockTab(dockTab.getAttribute('data-docktab'));
                return;
            }

            var closeBtn = e.target.closest('[data-close-modal]');
            if (closeBtn) {
                closeModal(closeBtn.getAttribute('data-close-modal'));
            }
        });

        // Color swatches & live inspector property updates for selected annotations
        function applyPropertyChangeToSelectedAnnotation() {
            var doc = getActiveDoc();
            if (!doc || state.selectedAnnotationIndex === -1) return;
            var list = getPageAnnotations(doc, doc.currentPage);
            var ann = list[state.selectedAnnotationIndex];
            if (!ann) return;
            if (el.propColor && el.propColor.value) {
                ann.color = el.propColor.value;
            }
            if (el.propFontSize && (ann.type === 'text' || ann.type === 'edit-text')) {
                var fs = parseInt(el.propFontSize.value, 10);
                if (fs >= 6 && fs <= 120) ann.fontSize = fs;
            }
            if (el.propStrokeWidth && (ann.type === 'pen' || ann.type === 'rect')) {
                var sw = parseInt(el.propStrokeWidth.value, 10);
                if (sw >= 1 && sw <= 40) ann.strokeWidth = sw;
            }
            doc.modified = true;
            renderTabsBar();
            redrawAnnotationOverlay();
        }

        var swatches = document.querySelectorAll('.color-swatch[data-color]');
        swatches.forEach(function (sw) {
            sw.addEventListener('click', function () {
                el.propColor.value = sw.getAttribute('data-color');
                applyPropertyChangeToSelectedAnnotation();
            });
        });

        if (el.propColor) {
            el.propColor.addEventListener('input', applyPropertyChangeToSelectedAnnotation);
        }
        if (el.propFontSize) {
            el.propFontSize.addEventListener('input', applyPropertyChangeToSelectedAnnotation);
        }
        if (el.propStrokeWidth) {
            el.propStrokeWidth.addEventListener('input', applyPropertyChangeToSelectedAnnotation);
        }

        // Zoom slider (debounced for smooth dragging performance in Editor and Organizer)
        var zoomSliderTimer = null;
        function handleFooterZoomSlider(e) {
            var val = parseInt(e.target.value, 10);
            if (isNaN(val)) return;
            state.zoom = val / 100;
            if (el.zoomPercentLabel) el.zoomPercentLabel.textContent = val + '%';
            if (el.floatingZoomLabel) el.floatingZoomLabel.textContent = val + '%';
            if (zoomSliderTimer) clearTimeout(zoomSliderTimer);
            zoomSliderTimer = setTimeout(function () {
                if (state.viewMode === 'organizer') {
                    renderOrganizerGrid();
                } else {
                    if (getActiveDoc() && state.viewMode === 'launcher') {
                        switchView('editor');
                    }
                    renderCurrentEditorPage();
                }
            }, 35);
        }
        if (el.zoomSlider) {
            el.zoomSlider.addEventListener('input', handleFooterZoomSlider);
            el.zoomSlider.addEventListener('change', handleFooterZoomSlider);
        }

        // Hidden file inputs
        document.getElementById('hiddenPdfInput').addEventListener('change', async function (e) {
            var files = e.target.files;
            for (var i = 0; i < files.length; i++) {
                var buf = await files[i].arrayBuffer();
                await addDocumentTab(files[i].name, new Uint8Array(buf), 'editor');
                trackUsageEvent('pdf_opened');
            }
            e.target.value = '';
        });

        document.getElementById('hiddenMergeInput').addEventListener('change', async function (e) {
            await mergeUploadedPdfFiles(e.target.files);
            e.target.value = '';
        });

        document.getElementById('hiddenImagesInput').addEventListener('change', async function (e) {
            await convertImagesToPdf(e.target.files);
            e.target.value = '';
        });

        document.getElementById('hiddenOverlayImageInput').addEventListener('change', async function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var doc = getActiveDoc();
            if (!doc) return;
            var dataUrl = await readFileAsDataURL(file);
            var img = new Image();
            img.onload = function () {
                var list = getPageAnnotations(doc, doc.currentPage);
                var ratio = img.height / (img.width || 1);
                var w = Math.min(200, img.width);
                var h = w * ratio;
                list.push({
                    type: 'image',
                    x: 90,
                    y: 120,
                    w: w,
                    h: h,
                    dataUrl: dataUrl,
                    imgElement: img
                });
                doc.modified = true;
                switchView('editor');
                setActiveTool('select');
                state.selectedAnnotationIndex = list.length - 1;
                redrawAnnotationOverlay();
                showToast('Bild eingefügt (mit der Maus frei verschiebbar)');
            };
            img.src = dataUrl;
            e.target.value = '';
        });

        // Split PDF Modal buttons
        document.getElementById('btnSplitToTab').addEventListener('click', async function () {
            var doc = getActiveDoc();
            if (!doc) return;
            await bakeAnnotationsIntoDocument(doc);
            var indices = parsePageRangeString(document.getElementById('splitRangeInput').value, doc.pageCount);
            var src = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var out = await PDFLib.PDFDocument.create();
            var copied = await out.copyPages(src, indices);
            copied.forEach(function (p) { out.addPage(p); });
            var bytes = await out.save();
            closeModal('modalSplit');
            await addDocumentTab('Auswahl_' + doc.name, bytes, 'editor');
            trackUsageEvent('pdf_split');
            showToast(indices.length + ' Seite(n) als neuen Tab extrahiert', 'success');
        });

        document.getElementById('btnSplitDownload').addEventListener('click', async function () {
            var doc = getActiveDoc();
            if (!doc) return;
            await bakeAnnotationsIntoDocument(doc);
            var indices = parsePageRangeString(document.getElementById('splitRangeInput').value, doc.pageCount);
            var src = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var out = await PDFLib.PDFDocument.create();
            var copied = await out.copyPages(src, indices);
            copied.forEach(function (p) { out.addPage(p); });
            var bytes = await out.save();
            closeModal('modalSplit');
            trackUsageEvent('pdf_split');
            downloadBlob(bytes, 'Extrahiert_' + doc.name, 'application/pdf');
        });

        document.getElementById('btnSplitAllZip').addEventListener('click', async function () {
            var doc = getActiveDoc();
            if (!doc) return;
            await bakeAnnotationsIntoDocument(doc);
            var src = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
            var zip = new window.JSZip();
            for (var i = 0; i < src.getPageCount(); i++) {
                var single = await PDFLib.PDFDocument.create();
                var cp = await single.copyPages(src, [i]);
                single.addPage(cp[0]);
                var b = await single.save();
                zip.file('Seite_' + (i + 1) + '.pdf', b);
            }
            var blob = await zip.generateAsync({ type: 'blob' });
            closeModal('modalSplit');
            trackUsageEvent('pdf_split');
            downloadBlob(blob, doc.name.replace(/\.pdf$/i, '') + '_Einzelseiten.zip', 'application/zip');
            showToast('Alle Seiten einzeln als PDF-ZIP gepackt!', 'success');
        });

        // Office / Document Converter Modal
        document.getElementById('officeFileInput').addEventListener('change', async function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var ext = file.name.split('.').pop().toLowerCase();
            document.getElementById('converterDocTitle').value = file.name.replace(/\.[^.]+$/, '') + '.pdf';

            if (ext === 'docx' && window.mammoth) {
                var buf = await file.arrayBuffer();
                var res = await window.mammoth.extractRawText({ arrayBuffer: buf });
                document.getElementById('converterTextInput').value = res.value || '';
                showToast('Word-Dokument (.docx) eingelesen');
            } else if ((ext === 'xlsx' || ext === 'xls' || ext === 'csv') && window.XLSX) {
                var xbuf = await file.arrayBuffer();
                var wb = window.XLSX.read(xbuf, { type: 'array' });
                var lines = [];
                wb.SheetNames.forEach(function (sheetName) {
                    lines.push('=== Tabelle: ' + sheetName + ' ===');
                    var csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
                    lines.push(csv);
                });
                document.getElementById('converterTextInput').value = lines.join('\n\n');
                showToast('Tabellendokument eingelesen');
            } else {
                var txt = await file.text();
                if (ext === 'html' || ext === 'htm') {
                    var tmp = document.createElement('div');
                    tmp.innerHTML = txt;
                    txt = tmp.textContent || tmp.innerText || '';
                }
                document.getElementById('converterTextInput').value = txt;
            }
        });

        document.getElementById('btnConvertTextToPdf').addEventListener('click', async function () {
            var txt = document.getElementById('converterTextInput').value;
            var title = document.getElementById('converterDocTitle').value || 'Konvertiert.pdf';
            closeModal('modalConverter');
            await convertTextContentToPdf(txt, title);
        });

        // Accessibility (PDF/UA & BITV) Modal Buttons
        document.getElementById('btnReRunA11yAudit').addEventListener('click', async function () {
            await updateAccessibilityUI(true);
        });

        // Merge PDF Modal Buttons
        var btnMergePick = document.getElementById('btnMergePickFiles');
        if (btnMergePick) {
            btnMergePick.addEventListener('click', function () {
                document.getElementById('hiddenMergeInput').click();
            });
        }
        var btnMergeTabs = document.getElementById('btnMergeAddOpenTabs');
        if (btnMergeTabs) {
            btnMergeTabs.addEventListener('click', async function () {
                await addOpenTabsToMergeQueue(false);
            });
        }
        var btnMergeClear = document.getElementById('btnMergeClearList');
        if (btnMergeClear) {
            btnMergeClear.addEventListener('click', function () {
                state.mergeQueue = [];
                renderMergeQueueUI();
            });
        }
        var btnRunMergeOpen = document.getElementById('btnRunMergeOpen');
        if (btnRunMergeOpen) {
            btnRunMergeOpen.addEventListener('click', async function () {
                await executeMergeQueue(false);
            });
        }
        var btnRunMergeDl = document.getElementById('btnRunMergeDownload');
        if (btnRunMergeDl) {
            btnRunMergeDl.addEventListener('click', async function () {
                await executeMergeQueue(true);
            });
        }

        document.getElementById('btnAutoFixA11y').addEventListener('click', async function () {
            await remediatePdfAccessibility();
        });

        var btnDlA11y = document.getElementById('btnDownloadA11yPdf');
        if (btnDlA11y) {
            btnDlA11y.addEventListener('click', async function () {
                var doc = getActiveDoc();
                if (!doc) return;
                await bakeAnnotationsIntoDocument(doc);
                var outName = doc.name.replace(/\.pdf$/i, '') + '_barrierefrei.pdf';
                downloadBlob(doc.bytes, outName, 'application/pdf');
                doc.modified = false;
                renderTabsBar();
                trackUsageEvent('pdf_exported');
                showToast('Barrierefreies PDF heruntergeladen: ' + outName, 'success');
            });
        }

        document.getElementById('btnExportA11yReportPdf').addEventListener('click', async function () {
            await exportAccessibilityReportPdf();
        });

        // Crop, Bates, Header/Footer & PDF Compare Modal Buttons
        document.getElementById('btnApplyCrop').addEventListener('click', async function () {
            await applyCropToPages();
        });

        document.getElementById('btnApplyBates').addEventListener('click', async function () {
            await applyBatesNumbering();
        });

        document.getElementById('btnApplyHeaderFooter').addEventListener('click', async function () {
            await applyThreeColumnHeaderFooter();
        });

        document.getElementById('btnRunPdfCompare').addEventListener('click', async function () {
            await runPdfCompare();
        });

        document.getElementById('btnCompareUploadSecond').addEventListener('click', function () {
            document.getElementById('hiddenPdfInput').click();
        });

        var btnModalCompress = document.getElementById('btnModalRunCompression');
        if (btnModalCompress) {
            btnModalCompress.addEventListener('click', async function () {
                var presetVal = document.getElementById('modalCompressPreset').value;
                await runPdfCompression(presetVal);
            });
        }

        var btnModalMeta = document.getElementById('btnModalApplyMetadata');
        if (btnModalMeta) {
            btnModalMeta.addEventListener('click', async function () {
                await applyMetadataToDocument(true);
            });
        }

        // Global Drag & Drop of files into the window
        var dropOverlay = document.getElementById('dropOverlay');
        var dropOverlayTimer = null;
        function hideDropOverlay() {
            if (dropOverlayTimer) {
                clearTimeout(dropOverlayTimer);
                dropOverlayTimer = null;
            }
            if (dropOverlay && dropOverlay.classList.contains('visible')) {
                dropOverlay.classList.remove('visible');
            }
        }
        window.addEventListener('dragstart', function () {
            state.isInternalDrag = true;
            hideDropOverlay();
        }, true);
        window.addEventListener('dragend', function () {
            state.isInternalDrag = false;
            hideDropOverlay();
        }, true);
        window.addEventListener('dragover', function (e) {
            if (state.isInternalDrag) {
                hideDropOverlay();
                return;
            }
            if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'file') {
                hideDropOverlay();
                return;
            }
            if (document.querySelector('.modal-backdrop.open')) {
                hideDropOverlay();
                return;
            }
            if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).indexOf('Files') !== -1) {
                e.preventDefault();
                if (dropOverlay) {
                    dropOverlay.classList.add('visible');
                }
                if (dropOverlayTimer) clearTimeout(dropOverlayTimer);
                dropOverlayTimer = setTimeout(hideDropOverlay, 250);
            }
        });
        window.addEventListener('dragleave', function (e) {
            if (
                !e.relatedTarget ||
                e.relatedTarget.nodeName === 'HTML' ||
                e.target === document.documentElement ||
                e.target === document.body ||
                e.clientX <= 0 ||
                e.clientY <= 0 ||
                e.clientX >= window.innerWidth ||
                e.clientY >= window.innerHeight
            ) {
                hideDropOverlay();
            }
        });
        // Immediately hide any lingering overlay on normal mouse/keyboard/window events
        window.addEventListener('mousemove', hideDropOverlay, { passive: true });
        window.addEventListener('mousedown', hideDropOverlay, { passive: true });
        window.addEventListener('pointerdown', hideDropOverlay, { passive: true });
        window.addEventListener('blur', hideDropOverlay);
        document.addEventListener('visibilitychange', hideDropOverlay);
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') hideDropOverlay();
        });
        window.addEventListener('drop', function () {
            state.isInternalDrag = false;
            hideDropOverlay();
        }, true);
        window.addEventListener('drop', async function (e) {
            state.isInternalDrag = false;
            hideDropOverlay();
            if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'file') return;
            if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
            e.preventDefault();

            var files = e.dataTransfer.files;
            var pdfs = [];
            var images = [];
            var docs = [];
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
                    pdfs.push(f);
                } else if (/^image\//i.test(f.type)) {
                    images.push(f);
                } else if (/\.(docx|xlsx|xls|csv|txt|md|html|htm)$/i.test(f.name)) {
                    docs.push(f);
                }
            }
            for (var p = 0; p < pdfs.length; p++) {
                var buf = await pdfs[p].arrayBuffer();
                await addDocumentTab(pdfs[p].name, new Uint8Array(buf), 'editor');
            }
            if (images.length > 0) {
                await convertImagesToPdf(images);
            }
            for (var d = 0; d < docs.length; d++) {
                var df = docs[d];
                var ext = df.name.split('.').pop().toLowerCase();
                var titleName = df.name.replace(/\.[^.]+$/, '') + '.pdf';
                var extractedText = '';
                if (ext === 'docx' && window.mammoth) {
                    var dbuf = await df.arrayBuffer();
                    var dres = await window.mammoth.extractRawText({ arrayBuffer: dbuf });
                    extractedText = dres.value || '';
                } else if ((ext === 'xlsx' || ext === 'xls' || ext === 'csv') && window.XLSX) {
                    var xbuf = await df.arrayBuffer();
                    var wb = window.XLSX.read(xbuf, { type: 'array' });
                    var sLines = [];
                    wb.SheetNames.forEach(function (sheetName) {
                        sLines.push('=== Tabelle: ' + sheetName + ' ===');
                        sLines.push(window.XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
                    });
                    extractedText = sLines.join('\n\n');
                } else {
                    extractedText = await df.text();
                    if (ext === 'html' || ext === 'htm') {
                        var tmpDiv = document.createElement('div');
                        tmpDiv.innerHTML = extractedText;
                        extractedText = tmpDiv.textContent || tmpDiv.innerText || '';
                    }
                }
                if (extractedText) {
                    await convertTextContentToPdf(extractedText, titleName);
                }
            }
        });

        // Fullscreen change events
        document.addEventListener('fullscreenchange', updateFullscreenUI);
        document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
        document.addEventListener('msfullscreenchange', updateFullscreenUI);

        // Full-Text PDF Search bar listeners
        var pdfSearchInp = document.getElementById('pdfSearchInput');
        var btnSearchPrev = document.getElementById('btnPdfSearchPrev');
        var btnSearchNext = document.getElementById('btnPdfSearchNext');
        var btnSearchClear = document.getElementById('btnPdfSearchClear');

        if (pdfSearchInp) {
            pdfSearchInp.addEventListener('keydown', async function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await runPdfFullTextSearch(pdfSearchInp.value, e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    clearPdfFullTextSearch();
                    pdfSearchInp.blur();
                }
            });
            pdfSearchInp.addEventListener('input', async function () {
                if (!pdfSearchInp.value.trim()) {
                    clearPdfFullTextSearch();
                }
            });
        }
        if (btnSearchPrev) {
            btnSearchPrev.addEventListener('click', async function () {
                if (pdfSearchInp) await runPdfFullTextSearch(pdfSearchInp.value, -1);
            });
        }
        if (btnSearchNext) {
            btnSearchNext.addEventListener('click', async function () {
                if (pdfSearchInp) await runPdfFullTextSearch(pdfSearchInp.value, 1);
            });
        }
        if (btnSearchClear) {
            btnSearchClear.addEventListener('click', function () {
                clearPdfFullTextSearch();
            });
        }

        // v1.3.0: Email, Batch Processing, ZUGFeRD & QR-Code Modal Listeners
        var btnSendPdfEmailNow = document.getElementById('btnSendPdfEmailNow');
        if (btnSendPdfEmailNow) {
            btnSendPdfEmailNow.addEventListener('click', sendCurrentPdfByEmail);
        }

        var btnRunBatchProcess = document.getElementById('btnRunBatchProcess');
        if (btnRunBatchProcess) {
            btnRunBatchProcess.addEventListener('click', runBatchProcessing);
        }

        var btnEmbedZugferdXml = document.getElementById('btnEmbedZugferdXml');
        if (btnEmbedZugferdXml) {
            btnEmbedZugferdXml.addEventListener('click', embedZugferdXmlIntoActivePdf);
        }

        var btnZugferdDownloadXml = document.getElementById('btnZugferdDownloadXml');
        if (btnZugferdDownloadXml) {
            btnZugferdDownloadXml.addEventListener('click', function () {
                if (!currentExtractedZugferdXml) return;
                var blob = new Blob([currentExtractedZugferdXml], { type: 'application/xml;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'factur-x.xml';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            });
        }

        var btnZugferdLoadExternalXml = document.getElementById('btnZugferdLoadExternalXml');
        var hiddenZugferdXmlInput = document.getElementById('hiddenZugferdXmlInput');
        if (btnZugferdLoadExternalXml && hiddenZugferdXmlInput) {
            btnZugferdLoadExternalXml.addEventListener('click', function () {
                hiddenZugferdXmlInput.value = '';
                hiddenZugferdXmlInput.click();
            });
            hiddenZugferdXmlInput.addEventListener('change', function (e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function (ev) {
                    var xmlText = String(ev.target.result || '');
                    renderZugferdDataInModal(xmlText, file.name);
                };
                reader.readAsText(file, 'UTF-8');
            });
        }

        ['qrPayloadInput', 'qrColorSelect', 'qrCaptionInput'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', renderQrPreviewCanvas);
                el.addEventListener('change', renderQrPreviewCanvas);
            }
        });

        var btnInsertQrIntoPdf = document.getElementById('btnInsertQrIntoPdf');
        if (btnInsertQrIntoPdf) {
            btnInsertQrIntoPdf.addEventListener('click', insertQrCodeIntoActivePage);
        }

        var btnSubmitUserPwChange = document.getElementById('btnSubmitUserPwChange');
        if (btnSubmitUserPwChange) {
            btnSubmitUserPwChange.addEventListener('click', async function () {
                var curInp = document.getElementById('userCurPwInput');
                var np1Inp = document.getElementById('userNewPw1Input');
                var np2Inp = document.getElementById('userNewPw2Input');
                var stBox = document.getElementById('userPwChangeStatus');

                var curPw = curInp ? curInp.value : '';
                var newPw1 = np1Inp ? np1Inp.value : '';
                var newPw2 = np2Inp ? np2Inp.value : '';

                function showPwMsg(msg, isOk) {
                    if (!stBox) return;
                    stBox.classList.remove('hidden');
                    stBox.style.background = isOk ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)';
                    stBox.style.border = isOk ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.4)';
                    stBox.style.color = isOk ? '#6ee7b7' : '#fca5a5';
                    stBox.textContent = msg;
                }

                if (!curPw || !newPw1 || !newPw2) {
                    showPwMsg('Bitte füllen Sie alle Passwortfelder vollständig aus.', false);
                    return;
                }
                if (newPw1.length < 6) {
                    showPwMsg('Das neue Passwort muss mindestens 6 Zeichen lang sein.', false);
                    return;
                }
                if (newPw1 !== newPw2) {
                    showPwMsg('Das neue Passwort und die Wiederholung stimmen nicht überein.', false);
                    return;
                }

                btnSubmitUserPwChange.disabled = true;
                try {
                    var fd = new FormData();
                    fd.append('csrf_token', window.PDFSTUDIO_CSRF_TOKEN || '');
                    fd.append('current_password', curPw);
                    fd.append('new_password', newPw1);
                    fd.append('confirm_password', newPw2);

                    var resp = await fetch('api.php?action=change_gatekeeper_password', {
                        method: 'POST',
                        body: fd
                    });
                    var data = await resp.json();
                    if (data && data.ok) {
                        showPwMsg(data.message || 'Ihr Passwort wurde erfolgreich geändert!', true);
                        showToast('Passwort erfolgreich geändert!', 'success');
                        if (curInp) curInp.value = '';
                        if (np1Inp) np1Inp.value = '';
                        if (np2Inp) np2Inp.value = '';
                        setTimeout(function () { closeModal('modalChangeUserPassword'); }, 1200);
                    } else {
                        showPwMsg((data && data.error) ? data.error : 'Passwortänderung fehlgeschlagen.', false);
                    }
                } catch (err) {
                    showPwMsg('Verbindungsfehler beim Speichern des Passworts.', false);
                } finally {
                    btnSubmitUserPwChange.disabled = false;
                }
            });
        }

        // v1.4.0: Auto-Redact, Attachments, Bookmarks/TOC, Sanitize Meta, N-up/Booklet & Mail Merge Listeners
        var btnScanAutoRedact = document.getElementById('btnScanAutoRedact');
        if (btnScanAutoRedact) {
            btnScanAutoRedact.addEventListener('click', scanPdfForAutoRedactPatterns);
        }
        var arSelectAllToggle = document.getElementById('arSelectAllToggle');
        if (arSelectAllToggle) {
            arSelectAllToggle.addEventListener('change', function () {
                autoRedactMatchesCache.forEach(function (m) { m.selected = arSelectAllToggle.checked; });
                renderAutoRedactMatchesList();
            });
        }
        var btnApplyAutoRedactBoxes = document.getElementById('btnApplyAutoRedactBoxes');
        if (btnApplyAutoRedactBoxes) {
            btnApplyAutoRedactBoxes.addEventListener('click', function () { applySelectedAutoRedactMatches(false); });
        }
        var btnApplyAndSanitizeAutoRedact = document.getElementById('btnApplyAndSanitizeAutoRedact');
        if (btnApplyAndSanitizeAutoRedact) {
            btnApplyAndSanitizeAutoRedact.addEventListener('click', function () { applySelectedAutoRedactMatches(true); });
        }

        var btnAddAttachmentFiles = document.getElementById('btnAddAttachmentFiles');
        var hiddenAttachmentInput = document.getElementById('hiddenAttachmentInput');
        if (btnAddAttachmentFiles && hiddenAttachmentInput) {
            btnAddAttachmentFiles.addEventListener('click', function () {
                hiddenAttachmentInput.value = '';
                hiddenAttachmentInput.click();
            });
            hiddenAttachmentInput.addEventListener('change', async function (e) {
                if (e.target.files && e.target.files.length > 0) {
                    await embedFilesIntoActivePdf(e.target.files);
                }
            });
        }

        var btnAutoDetectBookmarks = document.getElementById('btnAutoDetectBookmarks');
        if (btnAutoDetectBookmarks) {
            btnAutoDetectBookmarks.addEventListener('click', function () { autoDetectBookmarksFromPdf(false); });
        }
        var btnAddBookmarkRow = document.getElementById('btnAddBookmarkRow');
        if (btnAddBookmarkRow) {
            btnAddBookmarkRow.addEventListener('click', function () {
                var doc = getActiveDoc();
                workingBookmarksList.push({
                    title: 'Neues Kapitel ' + (workingBookmarksList.length + 1),
                    page: doc ? (doc.currentPage + 1) : 1,
                    level: 1
                });
                renderBookmarksEditorUI();
            });
        }
        var btnClearBookmarks = document.getElementById('btnClearBookmarks');
        if (btnClearBookmarks) {
            btnClearBookmarks.addEventListener('click', function () {
                workingBookmarksList = [];
                renderBookmarksEditorUI();
            });
        }
        var btnSaveBookmarksAndToc = document.getElementById('btnSaveBookmarksAndToc');
        if (btnSaveBookmarksAndToc) {
            btnSaveBookmarksAndToc.addEventListener('click', saveBookmarksAndTocToActivePdf);
        }

        var btnRunSanitizeMeta = document.getElementById('btnRunSanitizeMeta');
        if (btnRunSanitizeMeta) {
            btnRunSanitizeMeta.addEventListener('click', runSanitizeMetadataAndTraces);
        }

        var btnRunNupBooklet = document.getElementById('btnRunNupBooklet');
        if (btnRunNupBooklet) {
            btnRunNupBooklet.addEventListener('click', runNupOrBookletLayout);
        }

        var btnExportFormCsv = document.getElementById('btnExportFormCsv');
        if (btnExportFormCsv) {
            btnExportFormCsv.addEventListener('click', function () { exportActiveFormFieldsCsv(false); });
        }
        var btnExportFormJson = document.getElementById('btnExportFormJson');
        if (btnExportFormJson) {
            btnExportFormJson.addEventListener('click', exportActiveFormFieldsJson);
        }
        var btnDownloadCsvTemplate = document.getElementById('btnDownloadCsvTemplate');
        if (btnDownloadCsvTemplate) {
            btnDownloadCsvTemplate.addEventListener('click', function () { exportActiveFormFieldsCsv(true); });
        }
        var btnRunMailMerge = document.getElementById('btnRunMailMerge');
        if (btnRunMailMerge) {
            btnRunMailMerge.addEventListener('click', runMailMergeFromUploadedTable);
        }

        // v1.4.6: Digital Certificate Signature (.p12 / PKCS#7 / PAdES) Listeners
        ['btnCertTabSign', 'btnCertTabVerify', 'btnCertTabCreate'].forEach(function (btnId) {
            var b = document.getElementById(btnId);
            if (b) {
                b.addEventListener('click', function () {
                    switchDigitalCertTab(b.getAttribute('data-cert-tab'));
                });
            }
        });

        var certModeQuickRadio = document.getElementById('certModeQuickRadio');
        var certModeP12Radio = document.getElementById('certModeP12Radio');
        function updateCertSourceModeVisibility() {
            var qBox = document.getElementById('certQuickInputsBox');
            var pBox = document.getElementById('certP12InputsBox');
            var isP12 = certModeP12Radio && certModeP12Radio.checked;
            if (qBox) {
                if (isP12) qBox.classList.add('hidden');
                else qBox.classList.remove('hidden');
            }
            if (pBox) {
                if (isP12) pBox.classList.remove('hidden');
                else pBox.classList.add('hidden');
            }
        }
        if (certModeQuickRadio) certModeQuickRadio.addEventListener('change', updateCertSourceModeVisibility);
        if (certModeP12Radio) certModeP12Radio.addEventListener('change', updateCertSourceModeVisibility);

        var btnExecuteCertSignPdf = document.getElementById('btnExecuteCertSignPdf');
        if (btnExecuteCertSignPdf) {
            btnExecuteCertSignPdf.addEventListener('click', executeCryptographicPdfSigning);
        }
        var btnRunVerifyPdfCert = document.getElementById('btnRunVerifyPdfCert');
        if (btnRunVerifyPdfCert) {
            btnRunVerifyPdfCert.addEventListener('click', verifyActivePdfDigitalSignatures);
        }
        var btnGenerateDownloadP12 = document.getElementById('btnGenerateDownloadP12');
        if (btnGenerateDownloadP12) {
            btnGenerateDownloadP12.addEventListener('click', generateStandaloneP12Certificate);
        }

        // Keyboard shortcuts (Desktop feel)
        window.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                if (getActiveDoc() && pdfSearchInp) {
                    e.preventDefault();
                    if (state.viewMode !== 'editor') {
                        switchView('editor');
                    }
                    pdfSearchInp.focus();
                    pdfSearchInp.select();
                    return;
                }
            }
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
                e.preventDefault();
                executeCommand('open-pdf');
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                executeCommand('export-pdf');
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                executeCommand('undo');
            } else if (e.key === 'F1') {
                e.preventDefault();
                executeCommand('open-help');
            } else if (e.key === 'F11') {
                e.preventDefault();
                executeCommand('toggle-fullscreen');
            } else if (e.key === 'Delete') {
                if (state.selectedAnnotationIndex !== -1) {
                    executeCommand('delete-selected-annotation');
                }
            }
        });
    }

    // =========================================================================
    // Floating Help Assistant (Bottom-Right Interactive Guide & Tool Launcher)
    // =========================================================================
    var ASSISTANT_TOPICS = {
        'edit-text': {
            title: 'I✎ Vorhandenen Originaltext im PDF ändern',
            keywords: ['text', 'ändern', 'umschreiben', 'bearbeiten', 'ersetzen', 'originaltext', 'korrigieren', 'schreiben', 'wort', 'zeile', 'löschen'],
            html: '<strong>Originaltext im PDF direkt umschreiben (<code>I✎ Text ändern</code>):</strong><br>' +
                  '1. Klicken Sie im Reiter <em>✎ Bearbeiten</em> auf <strong>I✎ Text ändern</strong>.<br>' +
                  '2. Alle erkannten Textzeilen im PDF werden sofort <strong>blau gestrichelt umrahmt</strong>.<br>' +
                  '3. Klicken Sie auf eine beliebige Textzeile: Der Originaltext wird ausgelesen und Sie können ihn direkt überschreiben (oder leer lassen zum Entfernen).<br>' +
                  '4. Schriftgröße &amp; Farbe passen Sie rechts im Inspektor live an!<br>' +
                  '<em>Für ganz neuen Text an freien Stellen nutzen Sie <strong>T+ Neuer Text</strong>.</em>',
            cmd: 'launch-tool-edit-text',
            cmdLabel: '▶️ Werkzeug „I✎ Text ändern“ jetzt aktivieren'
        },
        'merge-split': {
            title: '➕ PDFs zusammenfügen, teilen & Seiten sortieren',
            keywords: ['verbinden', 'zusammenfügen', 'merge', 'teilen', 'split', 'extrahieren', 'sortieren', 'drehen', 'sammelmappe', 'seiten', 'löschen', 'reihenfolge'],
            html: '<strong>Seiten organisieren, verbinden &amp; teilen:</strong><br>' +
                  '• <strong>PDFs verbinden:</strong> Über <em>Start → ➕ Verbinden</em> mehrere PDFs zu einer Datei zusammenfügen.<br>' +
                  '• <strong>PDF teilen:</strong> Über <em>Start → ✂️ Teilen</em> Seitenbereiche (z. B. <code>1-3, 5</code>) extrahieren oder alle Seiten einzeln als ZIP speichern.<br>' +
                  '• <strong>Seiten-Studio:</strong> Oben auf <em>☷ Seiten-Studio</em> klicken, um Seiten per Drag &amp; Drop zu sortieren, zu drehen (<code>⟲</code>/<code>⟳</code>) oder in der <strong>Sammelmappe</strong> dokumentübergreifend zu sammeln.',
            cmd: 'view-organizer',
            cmdLabel: '▶️ Seiten-Studio öffnen'
        },
        'sign-stamp': {
            title: '🔏 Digitale Zertifikats-Signatur, Unterschrift & Stempel',
            keywords: ['unterschrift', 'signatur', 'unterschreiben', 'signieren', 'zertifikat', 'p12', 'pfx', 'pkcs7', 'adobe', 'stempel', 'bezahlt', 'genehmigt', 'bild', 'logo'],
            html: '<strong>Unterschreiben, Zertifikats-Signatur &amp; Stempeln:</strong><br>' +
                  '• <strong>🔏 Digitale Zertifikats-Signatur (Adobe Acrobat kompatibel):</strong> Klicken Sie auf <em>🔏 Digital signieren</em> (unter <em>Bearbeiten</em> oder <em>Layout &amp; Schutz</em>), um das PDF mit einem kryptografischen Zertifikat (<code>.p12</code> / RSA-2048 / SHA-256) manipulationssicher zu versiegeln oder vorhandene Signaturen zu prüfen.<br>' +
                  '• <strong>✍️ Optische Unterschrift:</strong> Klicken Sie auf <em>✍️ Signatur</em>, um mit der Maus zu unterschreiben oder Ihren Namen als Schreibschrift einzufügen.<br>' +
                  '• <strong>🏷️ Stempel:</strong> Wählen Sie unter <em>✎ Bearbeiten → 🏷️ Stempel</em> den gewünschten Stempeltext.',
            cmd: 'open-cert-sign-modal',
            cmdLabel: '▶️ Digitale Zertifikats-Signatur öffnen'
        },
        'redact': {
            title: '🛡️ Sicheres Schwärzen (Sanitize)',
            keywords: ['schwärzen', 'sanitize', 'unkenntlich', 'datenschutz', 'dsgvo', 'zensieren', 'geheim', 'vertraulich'],
            html: '<strong>Revisionssicheres Schwärzen in 2 Schritten:</strong><br>' +
                  '1. Wählen Sie unter <em>✎ Bearbeiten</em> das Werkzeug <strong>⬛ Schwärzen</strong> und ziehen Sie schwarze Balken über sensible Daten.<br>' +
                  '2. Klicken Sie anschließend auf <strong>🛡️ Sanitize (Sicher schwärzen)</strong>: Dadurch wird die Seite neu gerastert und der darunterliegende Textstrom <strong>physisch und unwiderruflich</strong> aus der PDF-Datei entfernt!',
            cmd: 'launch-tool-redact',
            cmdLabel: '▶️ Schwärzungs-Werkzeug aktivieren'
        },
        'compress': {
            title: '📉 PDF komprimieren & Metadaten',
            keywords: ['komprimieren', 'verkleinern', 'dateigröße', 'größe', 'kleiner', 'mb', 'kb', 'dpi', 'metadaten', 'autor', 'titel'],
            html: '<strong>PDF-Dateigröße verkleinern &amp; Metadaten pflegen:</strong><br>' +
                  '• Klicken Sie unter <em>🏠 Start</em> oder <em>🛡️ Layout &amp; Schutz</em> auf <strong>📉 Komprimieren</strong>.<br>' +
                  '• Wählen Sie zwischen <em>96 DPI (Stark komprimieren für E-Mail)</em>, <em>140 DPI (Ausgewogen)</em> oder <em>200 DPI (Hohe Druckqualität)</em>.<br>' +
                  '• Im selben Fenster können Sie auch <strong>Titel, Autor und Betreff</strong> des PDFs anpassen.',
            cmd: 'open-compress-modal',
            cmdLabel: '▶️ Komprimierungs-Dialog öffnen'
        },
        'ocr': {
            title: '🔎 Gescanntes PDF durchsuchbar machen (Sandwich-OCR)',
            keywords: ['ocr', 'scan', 'gescannt', 'durchsuchbar', 'texterkennung', 'tesseract', 'sandwich', 'kopieren', 'konverter', 'word', 'excel'],
            html: '<strong>Offline-Texterkennung (OCR) &amp; Konverter:</strong><br>' +
                  '• Öffnen Sie Ihr gescanntes PDF und klicken Sie im Reiter <em>🔄 Konverter &amp; OCR</em> auf <strong>🔎 Durchsuchbares PDF</strong>.<br>' +
                  '• PDF-Werkstatt Pro erkennt den Text komplett offline (Deutsch/Englisch) und bettet ihn unsichtbar exakt unter dem Scanbild ein — danach können Sie im PDF suchen (<code>Strg+F</code>), Text markieren und auch <code>I✎ Text ändern</code> nutzen!',
            cmd: 'make-searchable-pdf',
            cmdLabel: '▶️ Durchsuchbares PDF (OCR) starten'
        },
        'tts': {
            title: '🔊 PDF-Seite laut vorlesen lassen (Text-to-Speech)',
            keywords: ['vorlesen', 'sprechen', 'stimme', 'audio', 'hören', 'sprachausgabe', 'tts', 'screenreader', 'vorlesefunktion', 'laut'],
            html: '<strong>Offline-Vorlesefunktion (Text-to-Speech) mit Live-Zeilenmarkierung:</strong><br>' +
                  '• Klicken Sie im Reiter <em>🔄 Konverter &amp; OCR</em> oder <em>♿ Barrierefreiheit</em> auf <strong>🔊 Vorlesen</strong>: Die aktuelle PDF-Seite wird Zeile für Zeile in der erkannten Lesereihenfolge vorgelesen und im Dokument <strong>grün hervorgehoben</strong>.<br>' +
                  '• Mit <strong>🔊👆 Klick-Vorlesen</strong> klicken Sie direkt auf eine beliebige Textzeile im PDF, um genau ab dieser Stelle vorzulesen.<br>' +
                  '• Rechts im <strong>🔊 Vorlese-Player</strong> steuern Sie Pause/Weiter, Stopp, Lesetempo (0,85× bis 1,5×) und die Systemstimme.',
            cmd: 'tts-read-page',
            cmdLabel: '▶️ Aktuelle Seite jetzt vorlesen'
        },
        'a11y': {
            title: '♿ Barrierefreiheit (PDF/UA-1, WCAG 2.1 & BITV 2.0)',
            keywords: ['barrierefrei', 'barrierefreiheit', 'pdf/ua', 'bitv', 'wcag', 'screenreader', 'blinde', 'alt-text', 'tags', 'strukturbaum', 'auto-fix', 'pac'],
            html: '<strong>Barrierefreie PDFs nach PDF/UA-1 (PAC 2026) &amp; WCAG 2.1:</strong><br>' +
                  '• Im Reiter <em>♿ Barrierefreiheit</em> prüft <strong>♿ PDF/UA Prüfung</strong> Ihr Dokument auf alle 12 PDF/UA-1- &amp; WCAG-Kriterien.<br>' +
                  '• Mit <strong>⚡ Auto-Fix PDF/UA</strong> rüsten Sie fehlende Metadaten, Dokumenttitel, Sprache (<code>de-DE</code>), XMP-Header, Schriftmetriken, Kontraste, Alt-Texte, den getaggten Strukturbaum (<code>/StructTreeRoot</code> + MCIDs) und bei Scans sogar automatisch eine Offline-OCR-Schicht mit einem Klick nach!',
            cmd: 'open-a11y-modal',
            cmdLabel: '▶️ PDF/UA Barrierefreiheits-Assistent öffnen'
        },
        'autosave': {
            title: '⏱️ Automatische 5-Minuten-Sicherung (Auto-Save)',
            keywords: ['autosave', 'auto-save', 'automatisch', 'sicherung', 'speichern', 'wiederherstellen', 'absturz', 'browser'],
            html: '<strong>Automatische 5-Minuten-Sicherung im Browser:</strong><br>' +
                  '• Alle 5 Minuten sichert PDF-Werkstatt Pro Ihr geöffnetes Dokument inklusive aller Textfelder, Zeichnungen und Barrierefreiheits-Tags automatisch lokal in Ihrem Browser (IndexedDB).<br>' +
                  '• Unten in der Statusleiste sehen Sie jederzeit den Status (<code>⏱️ Auto-Save (5 Min.)</code>) und können die Sicherung per Klick ein- oder ausschalten.',
            cmd: 'toggle-autosave',
            cmdLabel: '▶️ Auto-Save umschalten'
        },
        'shortcuts': {
            title: '⌨️ Tastenkürzel & Vollbildmodus',
            keywords: ['tastenkürzel', 'tasten', 'shortcut', 'strg', 'vollbild', 'f11', 'f1', 'rückgängig', 'undo', 'zoom', 'design', 'dark', 'light', 'eigenschaften'],
            html: '<strong>Wichtige Tastenkombinationen &amp; Ansichten:</strong><br>' +
                  '• <code>Strg + O</code> : PDF-Datei öffnen<br>' +
                  '• <code>Strg + S</code> : PDF speichern / herunterladen<br>' +
                  '• <code>Strg + F</code> : Volltextsuche im PDF<br>' +
                  '• <code>Strg + Z</code> : Letzte Aktion rückgängig machen<br>' +
                  '• <code>Entf</code> : Ausgewähltes Element löschen<br>' +
                  '• <code>◨</code> (oben rechts) : Werkzeug-Eigenschaften rechts ein-/ausblenden<br>' +
                  '• <code>F11</code> (oder Button <code>⛶</code> oben rechts) : Vollbildmodus umschalten<br>' +
                  '• <code>F1</code> : Großes Benutzerhandbuch öffnen',
            cmd: 'toggle-fullscreen',
            cmdLabel: '▶️ Vollbildmodus umschalten (F11)'
        }
    };

    function updateAssistantContextBanner() {
        var bannerEl = document.getElementById('assistantContextText');
        if (!bannerEl) return;
        var doc = getActiveDoc();
        var docInfo = doc ? ('Dokument <em>„' + escapeHtml(doc.name) + '“</em> (Seite ' + (doc.currentPage + 1) + '/' + doc.pageCount + ') — ') : 'Noch kein PDF geöffnet — ';

        if (state.viewMode === 'launcher') {
            bannerEl.innerHTML = docInfo + 'Sie befinden sich auf der <strong>Start-Ansicht</strong>. Klicken Sie auf <strong>📂 PDF-Datei öffnen</strong> oder ziehen Sie eine PDF-Datei ins Fenster.';
        } else if (state.viewMode === 'organizer') {
            bannerEl.innerHTML = docInfo + 'Sie sind im <strong>Seiten-Studio</strong>. Ziehen Sie Seiten per Maus an eine neue Position oder drehen/löschen Sie Seiten direkt auf der Karte.';
        } else {
            var toolTips = {
                select: 'Werkzeug <strong>↖ Auswahl</strong> aktiv: Klicken Sie Elemente zum Verschieben an oder ändern Sie Texte per <strong>Doppelklick</strong>.',
                'edit-text': 'Werkzeug <strong>I✎ Text ändern</strong> aktiv: Klicken Sie auf eine <strong>blau umrahmte Textzeile</strong> im PDF, um den Originaltext direkt umzuschreiben.',
                text: 'Werkzeug <strong>T+ Neuer Text</strong> aktiv: Klicken Sie auf eine freie Stelle im PDF, um neuen Text einzufügen.',
                strikethrough: 'Werkzeug <strong>S&#822; Durchstreichen</strong> aktiv: Klicken Sie direkt auf eine markierte Textzeile oder ziehen Sie mit der Maus über einzelne Wörter.',
                'tts-click': 'Werkzeug <strong>🔊👆 Klick-Vorlesen</strong> aktiv: Klicken Sie auf eine <strong>grün umrahmte Textzeile</strong> im PDF, um ab dieser Zeile laut vorzulesen.',
                redact: 'Werkzeug <strong>⬛ Schwärzen</strong> aktiv: Ziehen Sie Rahmen über sensible Stellen und klicken Sie danach auf <strong>🛡️ Sanitize</strong>.',
                stamp: 'Werkzeug <strong>🏷️ Stempel</strong> aktiv: Blenden Sie bei Bedarf oben rechts mit <code>◨</code> die Werkzeug-Eigenschaften ein, um den Stempeltext zu wählen.'
            };
            bannerEl.innerHTML = docInfo + (toolTips[state.activeTool] || ('Visueller <strong>PDF-Editor</strong> aktiv (Werkzeug: ' + escapeHtml(state.activeTool) + ').'));
        }
    }

    function appendAssistantMessage(htmlContent, isUser, cmd, cmdLabel) {
        var container = document.getElementById('assistantMessages');
        if (!container) return;
        var msg = document.createElement('div');
        msg.className = 'assistant-msg ' + (isUser ? 'user' : 'bot');
        if (isUser) {
            msg.textContent = htmlContent;
        } else {
            msg.innerHTML = htmlContent;
            if (cmd) {
                var actWrap = document.createElement('div');
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'assistant-msg-action';
                btn.setAttribute('data-cmd', cmd);
                btn.textContent = cmdLabel || '▶️ Werkzeug jetzt starten';
                actWrap.appendChild(btn);
                msg.appendChild(actWrap);
            }
        }
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    function answerAssistantQuery(rawQuery) {
        var q = String(rawQuery || '').trim();
        if (!q) return;
        appendAssistantMessage(q, true);

        var lower = q.toLowerCase();

        // Additional specific question matchers (Crop, Bates, Compare, Forms, Share)
        if (lower.indexOf('zuschneiden') !== -1 || lower.indexOf('crop') !== -1 || lower.indexOf('rand') !== -1) {
            appendAssistantMessage(
                '<strong>📐 Seitenränder zuschneiden (Crop):</strong><br>Über <em>🛡️ Layout &amp; Schutz → 📐 Zuschneiden</em> geben Sie die Ränder in Millimetern (Oben, Unten, Links, Rechts) an, die auf der aktuellen Seite oder allen Seiten abgeschnitten werden sollen.',
                false,
                'open-crop-modal',
                '▶️ Zuschneiden-Dialog öffnen'
            );
            return;
        }
        if (lower.indexOf('bates') !== -1 || lower.indexOf('kopfzeile') !== -1 || lower.indexOf('fußzeile') !== -1 || lower.indexOf('seitenzahl') !== -1) {
            appendAssistantMessage(
                '<strong>🔢 Bates-Nummerierung &amp; 3-spaltige Kopf-/Fußzeilen:</strong><br>Über <em>🛡️ Layout &amp; Schutz → 📑 Kopf/Fuß &amp; Bates</em> beschriften Sie alle Seiten mit Aktenzeichen (z. B. <code>AZ-2026-000001</code>) sowie dynamischen Platzhaltern wie <code>{page}</code>, <code>{total}</code> und <code>{date}</code>.',
                false,
                'open-bates-modal',
                '▶️ Kopf-/Fußzeilen & Bates öffnen'
            );
            return;
        }
        if (lower.indexOf('vergleich') !== -1 || lower.indexOf('diff') !== -1 || lower.indexOf('unterschied') !== -1) {
            appendAssistantMessage(
                '<strong>⚖️ Zwei PDF-Dokumente vergleichen (PDF-Diff):</strong><br>Über <em>🏠 Start → ⚖️ Vergleichen</em> legt PDF-Werkstatt Pro zwei Dokumente nebeneinander, hebt optische Abweichungen pixelgenau rot hervor und zeigt darunter alle geänderten Textzeilen.',
                false,
                'open-compare-modal',
                '▶️ PDF-Vergleich öffnen'
            );
            return;
        }
        if (lower.indexOf('formular') !== -1 || lower.indexOf('checkbox') !== -1 || lower.indexOf('dropdown') !== -1 || lower.indexOf('link') !== -1) {
            appendAssistantMessage(
                '<strong>📋 Ausfüllbare PDF-Formulare (AcroForms) &amp; Links:</strong><br>Wechseln Sie in den Reiter <em>📋 Formulare &amp; Links</em>, um interaktive Textfelder, Checkboxen, Dropdown-Listen oder klickbare Links auf der Seite zu platzieren. Mit <em>🔒 Formular sperren</em> machen Sie ausgefüllte Felder unveränderbar.',
                false,
                'launch-tool-forms',
                '▶️ Formular-Werkzeuge aktivieren'
            );
            return;
        }

        // Score against ASSISTANT_TOPICS
        var bestKey = null;
        var bestScore = 0;
        for (var key in ASSISTANT_TOPICS) {
            var topic = ASSISTANT_TOPICS[key];
            var score = 0;
            for (var i = 0; i < topic.keywords.length; i++) {
                if (lower.indexOf(topic.keywords[i]) !== -1) {
                    score += 2;
                }
            }
            if (topic.title.toLowerCase().indexOf(lower) !== -1) {
                score += 3;
            }
            if (score > bestScore) {
                bestScore = score;
                bestKey = key;
            }
        }

        if (bestKey && ASSISTANT_TOPICS[bestKey]) {
            var match = ASSISTANT_TOPICS[bestKey];
            appendAssistantMessage(match.html, false, match.cmd, match.cmdLabel);
        } else {
            appendAssistantMessage(
                'Zu <strong>„' + escapeHtml(q) + '“</strong> empfehle ich einen Blick in unser durchsuchbares Benutzerhandbuch oder klicken Sie oben auf eines der Schnellthemen (z. B. <em>I✎ Text ändern</em>, <em>➕ Verbinden/Teilen</em>, <em>📉 Komprimieren</em>, <em>🔎 Scan-OCR</em>).',
                false,
                'open-help',
                '📖 Vollständiges Benutzerhandbuch öffnen'
            );
        }
    }

    function initFloatingAssistant() {
        var wrap = document.getElementById('floatingAssistant');
        var panel = document.getElementById('assistantPanel');
        var header = panel ? panel.querySelector('.assistant-header') : null;
        var toggleBtn = document.getElementById('btnToggleAssistant');
        var closeBtn = document.getElementById('btnCloseAssistant');
        var topicsBar = document.getElementById('assistantTopicsBar');
        var searchForm = document.getElementById('assistantSearchForm');
        var queryInput = document.getElementById('assistantQueryInput');

        if (!wrap || !panel || !toggleBtn) return;

        var isDragging = false;
        var hasMoved = false;
        var startMouseX = 0;
        var startMouseY = 0;
        var startBtnLeft = 0;
        var startBtnTop = 0;

        // Position the assistant based on the launcher button's center/corner coordinates
        function applyAssistantButtonPosition(btnLeft, btnTop, saveToStorage) {
            var btnW = 44;
            var btnH = 44;
            var vw = window.innerWidth || document.documentElement.clientWidth || 1200;
            var vh = window.innerHeight || document.documentElement.clientHeight || 800;

            var clampedLeft = Math.max(8, Math.min(vw - btnW - 8, Math.round(btnLeft)));
            var clampedTop = Math.max(8, Math.min(vh - btnH - 8, Math.round(btnTop)));

            var isLeftHalf = (clampedLeft + btnW / 2) < (vw / 2);
            var isTopHalf = (clampedTop + btnH / 2) < (vh / 2);

            wrap.classList.toggle('dock-left', isLeftHalf);
            wrap.classList.toggle('dock-top', isTopHalf);

            if (isLeftHalf) {
                wrap.style.left = clampedLeft + 'px';
                wrap.style.right = 'auto';
            } else {
                wrap.style.right = Math.max(8, vw - (clampedLeft + btnW)) + 'px';
                wrap.style.left = 'auto';
            }

            if (isTopHalf) {
                wrap.style.top = clampedTop + 'px';
                wrap.style.bottom = 'auto';
            } else {
                wrap.style.bottom = Math.max(8, vh - (clampedTop + btnH)) + 'px';
                wrap.style.top = 'auto';
            }

            if (saveToStorage) {
                try {
                    window.localStorage.setItem('pdfedith_assistant_pos', JSON.stringify({
                        leftRatio: clampedLeft / Math.max(1, vw),
                        topRatio: clampedTop / Math.max(1, vh)
                    }));
                } catch (err) {}
            }
        }

        function restoreSavedAssistantPosition() {
            try {
                var raw = window.localStorage.getItem('pdfedith_assistant_pos');
                if (!raw) return;
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed.leftRatio === 'number' && typeof parsed.topRatio === 'number') {
                    var vw = window.innerWidth || document.documentElement.clientWidth || 1200;
                    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
                    applyAssistantButtonPosition(parsed.leftRatio * vw, parsed.topRatio * vh, false);
                }
            } catch (err) {}
        }

        function startDrag(clientX, clientY) {
            var btnRect = toggleBtn.getBoundingClientRect();
            isDragging = true;
            hasMoved = false;
            startMouseX = clientX;
            startMouseY = clientY;
            startBtnLeft = btnRect.left;
            startBtnTop = btnRect.top;
        }

        function onMoveDrag(clientX, clientY) {
            if (!isDragging) return;
            var dx = clientX - startMouseX;
            var dy = clientY - startMouseY;
            if (!hasMoved && Math.sqrt(dx * dx + dy * dy) < 5) {
                return;
            }
            hasMoved = true;
            applyAssistantButtonPosition(startBtnLeft + dx, startBtnTop + dy, false);
        }

        function endDrag(clientX, clientY) {
            if (!isDragging) return;
            isDragging = false;
            if (hasMoved) {
                var dx = clientX - startMouseX;
                var dy = clientY - startMouseY;
                applyAssistantButtonPosition(startBtnLeft + dx, startBtnTop + dy, true);
            }
        }

        toggleBtn.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            startDrag(e.clientX, e.clientY);
        });

        if (header) {
            header.addEventListener('mousedown', function (e) {
                if (e.button !== 0 || e.target.closest('button')) return;
                startDrag(e.clientX, e.clientY);
            });
        }

        window.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            onMoveDrag(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', function (e) {
            if (!isDragging) return;
            endDrag(e.clientX, e.clientY);
        });

        // Touch support for tablets / touchscreens
        toggleBtn.addEventListener('touchstart', function (e) {
            if (!e.touches || !e.touches[0]) return;
            startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        if (header) {
            header.addEventListener('touchstart', function (e) {
                if (!e.touches || !e.touches[0] || e.target.closest('button')) return;
                startDrag(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });
        }

        window.addEventListener('touchmove', function (e) {
            if (!isDragging || !e.touches || !e.touches[0]) return;
            onMoveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        window.addEventListener('touchend', function (e) {
            if (!isDragging) return;
            var t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : { clientX: startMouseX, clientY: startMouseY };
            endDrag(t.clientX, t.clientY);
        });

        window.addEventListener('resize', function () {
            restoreSavedAssistantPosition();
        });

        toggleBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (hasMoved) {
                hasMoved = false;
                return;
            }
            var isOpen = panel.classList.toggle('open');
            if (isOpen) {
                updateAssistantContextBanner();
                if (queryInput) queryInput.focus();
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                panel.classList.remove('open');
            });
        }

        if (topicsBar) {
            topicsBar.addEventListener('click', function (e) {
                var chip = e.target.closest('[data-assist-topic]');
                if (!chip) return;
                var topicKey = chip.getAttribute('data-assist-topic');
                var topic = ASSISTANT_TOPICS[topicKey];
                if (topic) {
                    appendAssistantMessage(topic.title, true);
                    appendAssistantMessage(topic.html, false, topic.cmd, topic.cmdLabel);
                }
            });
        }

        if (searchForm && queryInput) {
            searchForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var val = queryInput.value;
                if (!val || !val.trim()) return;
                queryInput.value = '';
                answerAssistantQuery(val);
            });
        }

        restoreSavedAssistantPosition();
        updateAssistantContextBanner();
    }

    // Initialize Desktop Application
    setupAnnotationCanvasEvents();
    initSignatureModal();
    initEventListeners();
    initFloatingAssistant();
    initAutoSaveTimer();
    initTtsVoices();
    renderUserStampsVault();
})();
