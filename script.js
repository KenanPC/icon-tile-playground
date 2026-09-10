const ICON_SPRITE_URL = "assets/bootstrap-icons-1.13.1.svg";
const ICONS_PER_PAGE = 21;

const palettes = [
  { name: "Site mist", bg: "#f6f8fa", fg: "#0f766e" },
  { name: "Quiet ink", bg: "#ffffff", fg: "#101214" },
  { name: "Clinical line", bg: "#eef3f6", fg: "#64707c" },
  { name: "Night chart", bg: "#101214", fg: "#d8dee6" },
  { name: "Warm accent", bg: "#fbfaf7", fg: "#d97706" },
];

const originalHealthcareIcons = [
  "activity",
  "heart-pulse",
  "capsule",
  "prescription2",
  "hospital",
  "clipboard2-pulse",
  "smartwatch",
  "lungs",
];
const customIconPrefix = "custom-";

let iconLibrary = [];
let filteredIcons = [];
let customIconCount = 0;

const state = {
  selected: [],
  pattern: "scattered",
  backgroundColor: "#f6f8fa",
  shapeColor: "#0f766e",
  size: 42,
  spacing: 104,
  opacity: 46,
  jitter: 18,
  rotation: 10,
  randomRotation: true,
  flipHorizontal: false,
  flipVertical: false,
  seed: 19,
  previewSeed: 7301,
  page: 0,
  query: "",
};

const els = {
  preview: document.querySelector("#pattern-preview"),
  shapeGrid: document.querySelector("#shape-grid"),
  selectedStrip: document.querySelector("#selected-strip"),
  iconCount: document.querySelector("#icon-count"),
  iconPageStatus: document.querySelector("#icon-page-status"),
  iconSearch: document.querySelector("#icon-search"),
  prevIcons: document.querySelector("#prev-icons"),
  nextIcons: document.querySelector("#next-icons"),
  backgroundColor: document.querySelector("#background-color"),
  shapeColor: document.querySelector("#shape-color"),
  colorMenuButton: document.querySelector("#color-menu-button"),
  colorPopover: document.querySelector("#color-popover"),
  colorSplit: document.querySelector("#color-split"),
  patternSelect: document.querySelector("#pattern-select"),
  paletteRow: document.querySelector("#palette-row"),
  size: document.querySelector("#size-range"),
  spacing: document.querySelector("#spacing-range"),
  opacity: document.querySelector("#opacity-range"),
  jitter: document.querySelector("#jitter-range"),
  rotation: document.querySelector("#rotation-range"),
  randomRotation: document.querySelector("#random-rotation"),
  flipHorizontal: document.querySelector("#flip-horizontal"),
  flipVertical: document.querySelector("#flip-vertical"),
  svgUpload: document.querySelector("#svg-upload"),
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const titleize = (id) =>
  id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const parseViewBox = (viewBox) => {
  const values = String(viewBox || "0 0 16 16")
    .split(/\s+/)
    .map(Number);

  if (values.length !== 4 || values.some((value) => Number.isNaN(value))) {
    return { x: 0, y: 0, width: 16, height: 16 };
  }

  return { x: values[0], y: values[1], width: values[2], height: values[3] };
};

const getIcon = (id) => iconLibrary.find((icon) => icon.id === id);

const pickRandomIcons = (count, source = iconLibrary) => {
  const picked = [];
  const pickableIds = new Set();
  const addCandidates = (candidates) => {
    candidates
      .filter((icon) => !originalHealthcareIcons.includes(icon.id) && !pickableIds.has(icon.id))
      .sort(() => Math.random() - 0.5)
      .forEach((icon) => {
        pickableIds.add(icon.id);
        picked.push(icon.id);
      });
  };

  addCandidates(source);
  if (picked.length < count) {
    addCandidates(iconLibrary);
  }

  return picked.slice(0, count);
};

const makeRng = (seed) => {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const shuffledBySeed = (items, seed) => {
  const rng = makeRng(seed);
  return [...items]
    .map((item) => ({ item, sort: rng() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
};

const makeIconSvg = (icon, className = "") =>
  `<svg class="${className}" viewBox="${icon.viewBox}" aria-hidden="true">${icon.svg}</svg>`;

const svgIconMarkup = (icon) => {
  const box = icon.box;
  const scale = 48 / Math.max(box.width, box.height);
  const offsetX = (48 - box.width * scale) / 2 - box.x * scale;
  const offsetY = (48 - box.height * scale) / 2 - box.y * scale;

  return `<g transform="translate(${offsetX} ${offsetY}) scale(${scale})">${icon.svg}</g>`;
};

const getCellKey = (row, col) => `${row}:${col}`;

const chooseIconForCell = (icons, row, col, placedIcons, rng) => {
  if (icons.length <= 1) {
    return icons[0];
  }

  const neighborIds = [
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [-2, 0],
  ]
    .map(([rowOffset, colOffset]) => placedIcons.get(getCellKey(row + rowOffset, col + colOffset))?.id)
    .filter(Boolean);
  const startIndex = Math.floor(rng() * icons.length);
  const rankedIcons = icons
    .map((_, index) => {
      const wrappedIndex = (index + startIndex) % icons.length;
      const candidate = icons[wrappedIndex];
      const neighborMatches = neighborIds.filter((id) => id === candidate.id).length;

      return {
        icon: candidate,
        score: neighborMatches * 10 + Math.abs(wrappedIndex - ((row * 2 + col * 3) % icons.length)),
      };
    })
    .sort((a, b) => a.score - b.score);

  return rankedIcons[0].icon;
};

const buildTiles = (width, height) => {
  const rng = makeRng(state.seed);
  const spacing = Number(state.spacing);
  const size = Number(state.size);
  const jitter = Number(state.jitter);
  const rotation = Number(state.rotation);
  const icons = state.selected.map(getIcon).filter(Boolean);
  const cols = Math.ceil(width / spacing) + 4;
  const rows = Math.ceil(height / spacing) + 4;
  const tiles = [];
  const placedIcons = new Map();

  if (!icons.length) {
    return tiles;
  }

  for (let row = -2; row < rows; row += 1) {
    for (let col = -2; col < cols; col += 1) {
      let x = col * spacing;
      let y = row * spacing;

      if (state.pattern === "brick" && row % 2) {
        x += spacing / 2;
      }

      if (state.pattern === "diamond") {
        x += (row % 2) * spacing * 0.5;
        y *= 0.82;
      }

      if (state.pattern === "waves") {
        x += Math.sin(row * 0.8) * spacing * 0.26;
        y += Math.sin(col * 0.7) * spacing * 0.16;
      }

      if (state.pattern === "scattered") {
        x += (rng() - 0.5) * jitter * 2;
        y += (rng() - 0.5) * jitter * 2;
      } else {
        x += (rng() - 0.5) * jitter;
        y += (rng() - 0.5) * jitter;
      }

      const icon = chooseIconForCell(icons, row, col, placedIcons, rng);
      placedIcons.set(getCellKey(row, col), icon);

      tiles.push({
        x,
        y,
        size: size * (0.86 + rng() * 0.28),
        rotate: state.randomRotation ? (rng() - 0.5) * rotation * 2 : 0,
        flipX: state.flipHorizontal && rng() > 0.5,
        flipY: state.flipVertical && rng() > 0.5,
        icon,
      });
    }
  }

  return tiles;
};

const buildSvg = (width = 1200, height = 820) => {
  const tiles = buildTiles(width, height);
  const opacity = Number(state.opacity) / 100;
  const tileMarkup = tiles
    .map((tile) => {
      const x = Math.round(tile.x * 100) / 100;
      const y = Math.round(tile.y * 100) / 100;
      const scale = Math.round((tile.size / 48) * 1000) / 1000;
      const scaleX = tile.flipX ? -scale : scale;
      const scaleY = tile.flipY ? -scale : scale;
      const rotate = Math.round(tile.rotate * 100) / 100;

      return `<g fill="currentColor" style="color:${state.shapeColor};opacity:${opacity}" transform="translate(${x} ${y}) rotate(${rotate}) scale(${scaleX} ${scaleY}) translate(-24 -24)">${svgIconMarkup(tile.icon)}</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="${state.backgroundColor}"/>${tileMarkup}</svg>`;
};

const renderPreview = () => {
  const rect = els.preview.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width), 800);
  const height = Math.max(Math.round(rect.height), 520);
  els.preview.innerHTML = iconLibrary.length ? buildSvg(width, height) : "";
};

const getFilteredIcons = () => {
  const query = state.query.trim().toLowerCase();

  if (!query) {
    const selectedIds = new Set(state.selected);
    return shuffledBySeed(
      iconLibrary.filter((icon) => !selectedIds.has(icon.id) && !icon.id.startsWith(customIconPrefix)),
      state.previewSeed,
    );
  }

  const terms = query.split(/\s+/).filter(Boolean);
  const selectedIds = new Set(state.selected);
  return iconLibrary.filter((icon) => !selectedIds.has(icon.id) && terms.every((term) => icon.searchText.includes(term)));
};

const renderIconPicker = () => {
  filteredIcons = getFilteredIcons();
  const pageCount = Math.max(Math.ceil(filteredIcons.length / ICONS_PER_PAGE), 1);
  state.page = Math.min(state.page, pageCount - 1);
  const start = state.page * ICONS_PER_PAGE;
  const visibleIcons = filteredIcons.slice(start, start + ICONS_PER_PAGE);

  if (!iconLibrary.length) {
    els.shapeGrid.innerHTML = '<span class="loading-note">Loading icon sprite</span>';
    els.iconPageStatus.textContent = "Page 1";
    els.prevIcons.disabled = true;
    els.nextIcons.disabled = true;
    return;
  }

  if (!visibleIcons.length) {
    els.shapeGrid.innerHTML = '<span class="loading-note">No matching icons</span>';
    els.iconPageStatus.textContent = "No results";
    els.prevIcons.disabled = true;
    els.nextIcons.disabled = true;
    return;
  }

  els.shapeGrid.innerHTML = visibleIcons
    .map((icon) => {
      const pressed = state.selected.includes(icon.id);
      return `<button class="shape-button" type="button" data-shape="${icon.id}" aria-pressed="${pressed}" title="${icon.label}" aria-label="${icon.label}">${makeIconSvg(icon)}</button>`;
    })
    .join("");
  els.iconPageStatus.textContent = `${state.page + 1} / ${pageCount}`;
  els.prevIcons.disabled = state.page === 0;
  els.nextIcons.disabled = state.page >= pageCount - 1;
};

const renderSelectedStrip = () => {
  const icons = state.selected.map(getIcon).filter(Boolean);
  els.selectedStrip.style.setProperty("--current-bg", state.backgroundColor);
  els.selectedStrip.style.setProperty("--current-fg", state.shapeColor);
  els.iconCount.textContent = iconLibrary.length ? `${icons.length} selected` : "Loading";
  els.selectedStrip.innerHTML = icons.length
    ? icons.map((icon) => `<button class="selected-mark" type="button" data-selected-shape="${icon.id}" title="Remove ${icon.label}" aria-label="Remove ${icon.label}">${makeIconSvg(icon)}</button>`).join("")
    : '<span class="empty-note">Pick an icon</span>';
};

const renderPalette = () => {
  els.colorSplit.style.setProperty("--current-bg", state.backgroundColor);
  els.colorSplit.style.setProperty("--current-fg", state.shapeColor);
  els.paletteRow.innerHTML = palettes
    .map(
      (palette) =>
        `<button class="swatch-button" type="button" style="--bg:${palette.bg};--fg:${palette.fg}" data-bg="${palette.bg}" data-fg="${palette.fg}" aria-current="${palette.bg === state.backgroundColor && palette.fg === state.shapeColor}" title="${palette.name}" aria-label="${palette.name}"></button>`,
    )
    .join("");
};

const syncInputs = () => {
  els.backgroundColor.value = state.backgroundColor;
  els.shapeColor.value = state.shapeColor;
  els.size.value = state.size;
  els.spacing.value = state.spacing;
  els.opacity.value = state.opacity;
  els.jitter.value = state.jitter;
  els.rotation.value = state.rotation;
  els.randomRotation.checked = state.randomRotation;
  els.flipHorizontal.checked = state.flipHorizontal;
  els.flipVertical.checked = state.flipVertical;
  els.patternSelect.value = state.pattern;
};

const setColorPopoverOpen = (isOpen) => {
  els.colorPopover.hidden = !isOpen;
  els.colorMenuButton.setAttribute("aria-expanded", String(isOpen));
};

const refresh = () => {
  syncInputs();
  renderIconPicker();
  renderSelectedStrip();
  renderPalette();
  renderPreview();
};

const toggleIcon = (iconId) => {
  if (state.selected.includes(iconId)) {
    state.selected = state.selected.filter((id) => id !== iconId);
  } else {
    state.selected = [...state.selected, iconId];
  }

  state.page = 0;
  refresh();
};

const removeUnsafeSvgContent = (svgElement) => {
  svgElement.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, image").forEach((node) => {
    node.remove();
  });

  svgElement.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "style" || value.startsWith("javascript:") || value.startsWith("http:") || value.startsWith("https:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });
};

const svgFileToIcon = async (file) => {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");
  const svg = doc.querySelector("svg");

  if (parserError || !svg) {
    throw new Error(`${file.name} is not a valid SVG file.`);
  }

  removeUnsafeSvgContent(svg);
  const viewBox =
    svg.getAttribute("viewBox") ||
    `0 0 ${Number.parseFloat(svg.getAttribute("width")) || 24} ${Number.parseFloat(svg.getAttribute("height")) || 24}`;
  const id = `${customIconPrefix}${Date.now()}-${customIconCount}`;
  customIconCount += 1;
  const label = file.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim() || `Uploaded SVG ${customIconCount}`;

  return {
    id,
    label,
    viewBox,
    box: parseViewBox(viewBox),
    svg: svg.innerHTML,
    searchText: `${id} ${label} uploaded custom svg`.toLowerCase(),
  };
};

const uploadSvgIcons = async (files) => {
  const icons = [];

  for (const file of files) {
    if (file.type && file.type !== "image/svg+xml" && !file.name.toLowerCase().endsWith(".svg")) {
      continue;
    }

    icons.push(await svgFileToIcon(file));
  }

  if (!icons.length) {
    return;
  }

  iconLibrary = [...icons, ...iconLibrary];
  state.selected = [...state.selected, ...icons.map((icon) => icon.id)];
  state.query = "uploaded";
  els.iconSearch.value = state.query;
  refresh();
};

const download = (filename, href) => {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
};

const downloadSvg = () => {
  const svg = buildSvg(1800, 1200);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  download("icon-tile-playground-pattern.svg", URL.createObjectURL(blob));
};

const downloadPng = () => {
  const svg = buildSvg(1800, 1200);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    download("icon-tile-playground-pattern.png", canvas.toDataURL("image/png"));
  };

  image.src = url;
};

const loadIconLibrary = async () => {
  let sprite = window.BOOTSTRAP_ICON_SPRITE;

  if (!sprite) {
    const response = await fetch(ICON_SPRITE_URL);
    if (!response.ok) {
      throw new Error(`Could not load Bootstrap Icons sprite: ${response.status}`);
    }

    sprite = await response.text();
  }

  const doc = new DOMParser().parseFromString(sprite, "image/svg+xml");
  iconLibrary = [...doc.querySelectorAll("symbol[id]")]
    .map((symbol) => {
      const id = symbol.id;
      const viewBox = symbol.getAttribute("viewBox") || "0 0 16 16";
      const label = titleize(id);
      return {
        id,
        label,
        viewBox,
        box: parseViewBox(viewBox),
        svg: symbol.innerHTML,
        searchText: `${id} ${label}`.toLowerCase(),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  state.selected = pickRandomIcons(5);
  refresh();
};

els.shapeGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shape]");
  if (button) {
    toggleIcon(button.dataset.shape);
  }
});

els.selectedStrip.addEventListener("click", (event) => {
  const button = event.target.closest("[data-selected-shape]");
  if (button) {
    toggleIcon(button.dataset.selectedShape);
  }
});

els.iconSearch.addEventListener("input", () => {
  state.query = els.iconSearch.value;
  state.page = 0;
  renderIconPicker();
  renderSelectedStrip();
});

els.prevIcons.addEventListener("click", () => {
  state.page = Math.max(state.page - 1, 0);
  renderIconPicker();
});

els.nextIcons.addEventListener("click", () => {
  state.page += 1;
  renderIconPicker();
});

els.patternSelect.addEventListener("change", () => {
  state.pattern = els.patternSelect.value;
  renderPreview();
});

els.paletteRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-bg]");
  if (!button) {
    return;
  }

  state.backgroundColor = button.dataset.bg;
  state.shapeColor = button.dataset.fg;
  refresh();
});

els.colorMenuButton.addEventListener("click", () => {
  setColorPopoverOpen(els.colorPopover.hidden);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".color-menu")) {
    setColorPopoverOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setColorPopoverOpen(false);
  }
});

[
  ["backgroundColor", "backgroundColor"],
  ["shapeColor", "shapeColor"],
  ["size", "size"],
  ["spacing", "spacing"],
  ["opacity", "opacity"],
  ["jitter", "jitter"],
  ["rotation", "rotation"],
].forEach(([key, stateKey]) => {
  els[key].addEventListener("input", () => {
    state[stateKey] = els[key].value;
    renderPreview();
    renderPalette();
    renderSelectedStrip();
  });
});

[
  ["randomRotation", "randomRotation"],
  ["flipHorizontal", "flipHorizontal"],
  ["flipVertical", "flipVertical"],
].forEach(([key, stateKey]) => {
  els[key].addEventListener("change", () => {
    state[stateKey] = els[key].checked;
    renderPreview();
  });
});

document.querySelector("#clear-button").addEventListener("click", () => {
  state.selected = [];
  refresh();
});

els.svgUpload.addEventListener("change", async () => {
  await uploadSvgIcons([...els.svgUpload.files]);
  els.svgUpload.value = "";
});
document.querySelector("#download-svg").addEventListener("click", downloadSvg);
document.querySelector("#download-png").addEventListener("click", downloadPng);
window.addEventListener("resize", renderPreview);

refresh();
loadIconLibrary().catch((error) => {
  els.iconCount.textContent = "Load failed";
  els.shapeGrid.innerHTML = '<span class="loading-note">Could not load Bootstrap Icons</span>';
  throw error;
});
