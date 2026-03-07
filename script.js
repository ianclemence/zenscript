// DOM Elements
const editor = document.getElementById('editor');
const previewContent = document.getElementById('preview-content');
const fileList = document.getElementById('file-list');
const currentFilenameDisplay = document.getElementById('current-filename');
const unsavedIndicator = document.getElementById('unsaved-indicator');
const themeSelect = document.getElementById('theme-select');
const fontSizeInput = document.getElementById('font-size');
const bgColorInput = document.getElementById('bg-color');

// Buttons
const openDirBtn = document.getElementById('open-directory');
const newFileBtn = document.getElementById('new-file');
const saveFileBtn = document.getElementById('save-file');
const exportPdfBtn = document.getElementById('export-pdf');

// State Management
let directoryHandle = null;
let currentFileHandle = null;
let isUnsaved = false;
let files = []; // List of file entries

// Initialize
function init() {
    setupEventListeners();
    updatePreview();
    loadPreferences();
}

function setupEventListeners() {
    // Editor input
    editor.addEventListener('input', () => {
        updatePreview();
        markAsUnsaved(true);
    });

    // File actions
    openDirBtn.addEventListener('click', openDirectory);
    newFileBtn.addEventListener('click', createNewFile);
    saveFileBtn.addEventListener('click', saveCurrentFile);
    exportPdfBtn.addEventListener('click', exportToPDF);

    // Customization
    themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
    fontSizeInput.addEventListener('input', (e) => applyFontSize(e.target.value));
    bgColorInput.addEventListener('input', (e) => applyBgColor(e.target.value));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentFile();
        }
    });
}

// --- Markdown Rendering ---
function updatePreview() {
    const markdown = editor.value;
    // Use marked library from CDN
    if (window.marked) {
        previewContent.innerHTML = marked.parse(markdown);
    } else {
        previewContent.textContent = markdown;
    }
}

// --- File System Operations ---
async function openDirectory() {
    try {
        directoryHandle = await window.showDirectoryPicker();
        await scanDirectory();
    } catch (err) {
        console.error('Error opening directory:', err);
        if (err.name !== 'AbortError') {
            alert('Could not open directory. Make sure your browser supports the File System Access API.');
        }
    }
}

async function scanDirectory() {
    if (!directoryHandle) return;

    files = [];
    fileList.innerHTML = '';

    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
            files.push(entry);
            addFileToList(entry);
        }
    }
}

function addFileToList(fileHandle) {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `<i class="far fa-file-alt"></i> ${fileHandle.name}`;
    li.addEventListener('click', () => openFile(fileHandle));
    fileList.appendChild(li);
}

async function openFile(fileHandle) {
    if (isUnsaved) {
        if (!confirm('You have unsaved changes. Discard them?')) return;
    }

    try {
        const file = await fileHandle.getFile();
        const content = await file.text();
        
        currentFileHandle = fileHandle;
        editor.value = content;
        currentFilenameDisplay.textContent = fileHandle.name;
        
        updatePreview();
        markAsUnsaved(false);
        updateActiveFileHighlight(fileHandle.name);
    } catch (err) {
        console.error('Error reading file:', err);
        alert('Could not read file.');
    }
}

async function saveCurrentFile() {
    if (!currentFileHandle) {
        // If it's a new file, prompt for name and save in current directory
        if (!directoryHandle) {
            alert('Please open a directory first to save files.');
            return;
        }
        const fileName = prompt('Enter filename (e.g., note.md):', 'Untitled.md');
        if (!fileName) return;
        
        try {
            currentFileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            currentFilenameDisplay.textContent = currentFileHandle.name;
            await scanDirectory();
        } catch (err) {
            console.error('Error creating file:', err);
            return;
        }
    }

    try {
        const writable = await currentFileHandle.createWritable();
        await writable.write(editor.value);
        await writable.close();
        markAsUnsaved(false);
        console.log('File saved successfully');
    } catch (err) {
        console.error('Error saving file:', err);
        alert('Could not save file. Ensure you have granted write permissions.');
    }
}

function createNewFile() {
    if (isUnsaved && !confirm('Discard unsaved changes?')) return;
    
    currentFileHandle = null;
    editor.value = '';
    currentFilenameDisplay.textContent = 'Untitled.md';
    updatePreview();
    markAsUnsaved(false);
    updateActiveFileHighlight(null);
}

// --- UI Helpers ---
function markAsUnsaved(unsaved) {
    isUnsaved = unsaved;
    unsavedIndicator.hidden = !unsaved;
}

function updateActiveFileHighlight(filename) {
    const items = fileList.querySelectorAll('.file-item');
    items.forEach(item => {
        if (item.textContent.trim() === filename) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// --- Customization ---
function applyTheme(theme) {
    document.body.className = '';
    if (theme !== 'light') {
        document.body.classList.add(`theme-${theme}`);
    }
    // Update color picker value to match theme background if needed
    localStorage.setItem('md-editor-theme', theme);
}

function applyFontSize(size) {
    previewContent.style.fontSize = `${size}px`;
    localStorage.setItem('md-editor-font-size', size);
}

function applyBgColor(color) {
    previewContent.style.backgroundColor = color;
    localStorage.setItem('md-editor-bg-color', color);
}

function loadPreferences() {
    const theme = localStorage.getItem('md-editor-theme') || 'light';
    const fontSize = localStorage.getItem('md-editor-font-size') || '16';
    const bgColor = localStorage.getItem('md-editor-bg-color') || '#ffffff';

    themeSelect.value = theme;
    fontSizeInput.value = fontSize;
    bgColorInput.value = bgColor;

    applyTheme(theme);
    applyFontSize(fontSize);
    applyBgColor(bgColor);
}

// --- PDF Export ---
function exportToPDF() {
    // Simplest vanilla way: print the preview pane
    // To only print the preview, we can temporarily hide other elements or use a print-only stylesheet
    // For a better experience, we'll use a print media query in CSS (added below)
    window.print();
}

// Start the app
init();
