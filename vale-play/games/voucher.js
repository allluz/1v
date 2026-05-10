import { h, openModal, setToast } from "../lib/ui.js";
import { copyToClipboard } from "../lib/share.js";

export async function mountVoucher({ rootEl }) {
  rootEl.innerHTML = "";

  const container = h("div", { class: "vch-container" });
  const formArea = h("div", { class: "vch-form-area" });
  const previewArea = h("div", { class: "vch-preview-area" });

  container.append(formArea, previewArea);
  rootEl.append(h("div", { class: "game-shell" }, [container]));

  let data = {
    title: "Visita ao Vale",
    date: new Date().toISOString().split('T')[0],
    time: "14:00",
    location: "União da Vitória, PR",
    description: "Voucher válido para entrada única."
  };

  injectStyles();
  renderForm();
  renderPreview();

  function renderForm() {
    formArea.innerHTML = "";
    
    const fields = [
      { id: "title", label: "Título do Vale", type: "text", value: data.title },
      { id: "date", label: "Data", type: "date", value: data.date },
      { id: "time", label: "Hora", type: "time", value: data.time },
      { id: "location", label: "Local", type: "text", value: data.location },
      { id: "description", label: "Descrição", type: "textarea", value: data.description }
    ];

    fields.forEach(f => {
      const group = h("div", { class: "vch-group" });
      const label = h("label", { class: "vch-label" }, f.label);
      let input;
      
      if (f.type === "textarea") {
        input = h("textarea", { class: "vch-input", rows: 3 }, f.value);
      } else {
        input = h("input", { class: "vch-input", type: f.type, value: f.value });
      }

      input.addEventListener("input", (e) => {
        data[f.id] = e.target.value;
        renderPreview();
      });

      group.append(label, input);
      formArea.append(group);
    });

    const btnShare = h("button", { 
      class: "btn btn--primary", 
      type: "button",
      onclick: shareVoucher
    }, "Compartilhar Vale");
    
    const btnCalendar = h("button", { 
      class: "btn btn--ghost", 
      type: "button",
      onclick: addToCalendar
    }, "Agendar no Calendar");

    const actions = h("div", { class: "vch-actions" }, [btnShare, btnCalendar]);
    formArea.append(actions);
  }

  function renderPreview() {
    previewArea.innerHTML = "";
    
    const card = h("div", { class: "vch-card" });
    const top = h("div", { class: "vch-card-top" });
    const brand = h("div", { class: "vch-card-brand" }, "1V");
    const tag = h("div", { class: "vch-card-tag" }, "Vale Atuante");
    top.append(brand, tag);

    const body = h("div", { class: "vch-card-body" });
    const title = h("div", { class: "vch-card-title" }, data.title || "Sem título");
    
    const info = h("div", { class: "vch-card-info" });
    
    const dateRow = h("div", { class: "vch-card-row" });
    dateRow.innerHTML = `<i data-lucide="calendar"></i> <span>${formatDate(data.date)} às ${data.time}</span>`;
    
    const locRow = h("div", { class: "vch-card-row" });
    locRow.innerHTML = `<i data-lucide="map-pin"></i> <span>${data.location}</span>`;
    
    info.append(dateRow, locRow);
    
    const desc = h("div", { class: "vch-card-desc" }, data.description);
    
    const footer = h("div", { class: "vch-card-footer" });
    footer.innerHTML = `<span>#UMVale</span> <span>ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</span>`;

    body.append(title, info, desc);
    card.append(top, body, footer);
    
    previewArea.append(card);
    if (window.lucide) window.lucide.createIcons();
  }

  function formatDate(d) {
    if (!d) return "";
    const parts = d.split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  async function shareVoucher() {
    const text = `Vale Atuante: ${data.title}\n📅 ${formatDate(data.date)} às ${data.time}\n📍 ${data.location}\n\n${data.description}\n\n#UMVale`;
    await copyToClipboard(text);
    setToast("Copiado!");
  }

  function addToCalendar() {
    const startDateTime = new Date(`${data.date}T${data.time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1h duration
    
    const format = (date) => date.toISOString().replace(/-|:|\.\d+/g, "");
    
    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action", "TEMPLATE");
    url.searchParams.set("text", `[Vale Atuante] ${data.title}`);
    url.searchParams.set("dates", `${format(startDateTime)}/${format(endDateTime)}`);
    url.searchParams.set("details", data.description);
    url.searchParams.set("location", data.location);
    
    window.open(url.toString(), "_blank");
  }

  function injectStyles() {
    if (document.getElementById("voucherStyles")) return;
    const style = document.createElement("style");
    style.id = "voucherStyles";
    style.textContent = `
      .vch-container { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; }
      @media (max-width: 768px) { .vch-container { grid-template-columns: 1fr; } }
      
      .vch-form-area { display: flex; flex-direction: column; gap: 14px; }
      .vch-group { display: flex; flex-direction: column; gap: 6px; }
      .vch-label { font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; color: var(--dim); letter-spacing: 0.1em; }
      .vch-input { 
        background: rgba(245, 242, 236, 0.05); 
        border: 1px solid var(--stroke); 
        border-radius: 8px; 
        padding: 10px; 
        color: var(--text); 
        font-family: var(--font-body);
        font-size: 0.95rem;
      }
      .vch-input:focus { border-color: var(--orange); outline: none; }
      
      .vch-actions { display: flex; gap: 10px; margin-top: 10px; }
      
      .vch-preview-area { display: flex; align-items: flex-start; justify-content: center; }
      
      .vch-card {
        width: 100%;
        max-width: 320px;
        background: linear-gradient(135deg, #1b255f 0%, #090c1a 100%);
        border: 1px solid rgba(255, 78, 0, 0.3);
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        position: relative;
        overflow: hidden;
      }
      
      .vch-card::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(255,78,0,0.05) 0%, transparent 70%);
        pointer-events: none;
      }

      .vch-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .vch-card-brand { 
        background: var(--orange); 
        color: white; 
        font-weight: 900; 
        padding: 4px 8px; 
        border-radius: 6px; 
        font-size: 0.8rem;
      }
      .vch-card-tag { font-family: var(--font-mono); font-size: 0.6rem; text-transform: uppercase; color: rgba(255,255,255,0.5); }
      
      .vch-card-title { font-family: var(--font-head); font-weight: 900; font-size: 1.4rem; color: white; margin-bottom: 15px; }
      
      .vch-card-info { display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; }
      .vch-card-row { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.8); }
      .vch-card-row i { width: 14px; height: 14px; color: var(--orange); }
      
      .vch-card-desc { font-size: 0.8rem; color: rgba(255,255,255,0.6); line-height: 1.4; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; margin-top: 10px; }
      
      .vch-card-footer { display: flex; justify-content: space-between; margin-top: 20px; font-family: var(--font-mono); font-size: 0.55rem; color: rgba(255,255,255,0.3); }
    `;
    document.head.appendChild(style);
  }
}
