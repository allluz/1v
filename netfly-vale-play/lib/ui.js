let toastTimer = null;

export function setToast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast--show"), 1600);
}

export function openModal(title, bodyHtml) {
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");
  if (!modal || !modalTitle || !modalBody || !modalClose) return;

  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;

  modalClose.onclick = () => modal.close();
  modal.onclick = (e) => {
    // Close when clicking the backdrop (dialog itself)
    if (e.target === modal) modal.close();
  };
  modal.showModal();
}

export function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "dataset" && value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) el.dataset[k] = v;
    } else if (key in el) el[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

