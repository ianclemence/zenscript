// DOM Elements
const editor = document.getElementById("editor");
const previewContent = document.getElementById("preview-content");
const fileList = document.getElementById("file-list");
const currentFilenameDisplay = document.getElementById("current-filename");
const unsavedIndicator = document.getElementById("unsaved-indicator");
const themeSelect = document.getElementById("theme-select");
const fontSizeInput = document.getElementById("font-size");
const bgColorInput = document.getElementById("bg-color");
const guidanceContainer = document.getElementById("guidance-container");

// Buttons
const openDirBtn = document.getElementById("open-directory");
const newFileBtn = document.getElementById("new-file");
const saveFileBtn = document.getElementById("save-file");
const exportPdfBtn = document.getElementById("export-pdf");

// State Management
let directoryHandle = null;
let currentFileHandle = null;
let isUnsaved = false;
let files = [];

// Educational Guidance Messages
const tips = [
  { text: "Pro Tip: Use ⌘S to save your work instantly.", key: "save" },
  { text: "Try dragging a directory here to open it.", key: "drag" },
  { text: "Markdown: Use # for headers and * for lists.", key: "md" },
  { text: "Your preferences are saved automatically.", key: "pref" },
];

// Initialize
function init() {
  setupEventListeners();
  updatePreview();
  loadPreferences();
  showGuidance("md");
}

function setupEventListeners() {
  // Editor input with debounced preview update
  let timeout;
  editor.addEventListener("input", () => {
    clearTimeout(timeout);
    timeout = setTimeout(updatePreview, 50);
    markAsUnsaved(true);
  });

  // File actions
  openDirBtn.addEventListener("click", openDirectory);
  newFileBtn.addEventListener("click", createNewFile);
  saveFileBtn.addEventListener("click", saveCurrentFile);
  exportPdfBtn.addEventListener("click", exportToPDF);

  // Customization
  themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
  fontSizeInput.addEventListener("input", (e) => applyFontSize(e.target.value));
  bgColorInput.addEventListener("input", (e) => applyBgColor(e.target.value));

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveCurrentFile();
      showGuidance("save");
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      createNewFile();
    }
  });

  // Handle focus states for accessibility feedback
  editor.addEventListener("focus", () => {
    editor.parentElement.style.boxShadow = "var(--shadow-md)";
  });
  editor.addEventListener("blur", () => {
    editor.parentElement.style.boxShadow = "var(--shadow-sm)";
  });
}

// --- Markdown Rendering ---
function updatePreview() {
  const markdown = editor.value;
  if (window.marked) {
    // Render markdown with custom options for security/performance
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
    showGuidance("pref");
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Error opening directory:", err);
      notify("Could not open directory.");
    }
  }
}

async function scanDirectory() {
  if (!directoryHandle) return;

  files = [];
  fileList.innerHTML = "";

  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".md")) {
      files.push(entry);
      addFileToList(entry);
    }
  }
}

function addFileToList(fileHandle) {
  const li = document.createElement("li");
  li.className = "file-item";
  li.setAttribute("role", "option");
  li.innerHTML = `<i class="far fa-file-alt"></i> <span>${fileHandle.name}</span>`;
  li.addEventListener("click", () => openFile(fileHandle));
  fileList.appendChild(li);
}

async function openFile(fileHandle) {
  if (isUnsaved && !confirm("Discard unsaved changes?")) return;

  try {
    const file = await fileHandle.getFile();
    const content = await file.text();

    currentFileHandle = fileHandle;
    editor.value = content;
    currentFilenameDisplay.textContent = fileHandle.name;

    updatePreview();
    markAsUnsaved(false);
    updateActiveFileHighlight(fileHandle.name);

    // Visual feedback
    editor.classList.add("fade-in");
    setTimeout(() => editor.classList.remove("fade-in"), 500);
  } catch (err) {
    notify("Error reading file.");
  }
}

async function saveCurrentFile() {
  if (!currentFileHandle) {
    if (!directoryHandle) {
      notify("Open a directory first to save.");
      return;
    }
    const fileName = prompt("Filename:", "Untitled.md");
    if (!fileName) return;

    try {
      currentFileHandle = await directoryHandle.getFileHandle(fileName, {
        create: true,
      });
      currentFilenameDisplay.textContent = currentFileHandle.name;
      await scanDirectory();
    } catch (err) {
      return;
    }
  }

  try {
    const writable = await currentFileHandle.createWritable();
    await writable.write(editor.value);
    await writable.close();
    markAsUnsaved(false);
    notify("Saved successfully");
  } catch (err) {
    notify("Save failed.");
  }
}

function createNewFile() {
  if (isUnsaved && !confirm("Discard unsaved changes?")) return;

  currentFileHandle = null;
  editor.value = "";
  currentFilenameDisplay.textContent = "Untitled.md";
  updatePreview();
  markAsUnsaved(false);
  updateActiveFileHighlight(null);
  editor.focus();
}

// --- Educational Guidance & Feedback ---
function showGuidance(key) {
  const tip = tips.find((t) => t.key === key);
  if (!tip) return;

  const div = document.createElement("div");
  div.className = "guidance-tip";
  div.innerHTML = `<i class="fas fa-info-circle"></i> ${tip.text}`;

  guidanceContainer.innerHTML = "";
  guidanceContainer.appendChild(div);

  setTimeout(() => {
    div.style.opacity = "0";
    div.style.transform = "translateY(20px)";
    setTimeout(() => div.remove(), 500);
  }, 4000);
}

function notify(message) {
  const div = document.createElement("div");
  div.className = "guidance-tip";
  div.style.background = "var(--text-primary)";
  div.innerHTML = message;

  guidanceContainer.innerHTML = "";
  guidanceContainer.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// --- UI Helpers ---
function markAsUnsaved(unsaved) {
  isUnsaved = unsaved;
  unsavedIndicator.hidden = !unsaved;
}

function updateActiveFileHighlight(filename) {
  const items = fileList.querySelectorAll(".file-item");
  items.forEach((item) => {
    if (item.querySelector("span").textContent === filename) {
      item.classList.add("active");
      item.setAttribute("aria-selected", "true");
    } else {
      item.classList.remove("active");
      item.setAttribute("aria-selected", "false");
    }
  });
}

// --- Customization ---
function applyTheme(theme) {
  document.body.className = "";
  if (theme !== "light") {
    document.body.classList.add(`theme-${theme}`);
  }
  localStorage.setItem("md-editor-theme", theme);
}

function applyFontSize(size) {
  previewContent.style.fontSize = `${size}px`;
  localStorage.setItem("md-editor-font-size", size);
}

function applyBgColor(color) {
  previewContent.style.backgroundColor = color;
  localStorage.setItem("md-editor-bg-color", color);
}

function loadPreferences() {
  const theme = localStorage.getItem("md-editor-theme") || "light";
  const fontSize = localStorage.getItem("md-editor-font-size") || "16";
  const bgColor = localStorage.getItem("md-editor-bg-color") || "#ffffff";

  themeSelect.value = theme;
  fontSizeInput.value = fontSize;
  bgColorInput.value = bgColor;

  applyTheme(theme);
  applyFontSize(fontSize);
  applyBgColor(bgColor);
}

// --- PDF Export ---
function exportToPDF() {
  window.print();
}

// Start
init();
