import { h, openModal, setToast } from "../lib/ui.js";
import { copyToClipboard } from "../lib/share.js";

export async function mountCopywriter({ rootEl }) {
  rootEl.innerHTML = "";

  const container = h("div", { class: "cpw-container" });
  const editorArea = h("div", { class: "cpw-editor-area" });
  const previewArea = h("div", { class: "cpw-preview-area" });

  container.append(editorArea, previewArea);
  rootEl.append(h("div", { class: "game-shell" }, [container]));

  let data = {
    title: "",
    kicker: "Radar Iguaçu",
    content: "",
    date: new Date().toISOString().split('T')[0],
    time: "09:00",
    voice: "standard"
  };

  const voices = {
    standard: { label: "Padrão 1V", prefix: "RADAR IGUAÇU | ", suffix: "\n\nAcompanhe mais em UM Vale." },
    emergency: { label: "Emergência", prefix: "⚠️ URGENTE: ", suffix: "\n\nOcorrência em andamento. Mais informações em breve." },
    narrative: { label: "Narrativo", prefix: "MEMÓRIAS DO VALE: ", suffix: "\n\nHistórias que conectam nossa gente." },
    esporte: { label: "Esporte", prefix: "1V ESPORTE: ", suffix: "\n\nCobertura completa do esporte regional." }
  };

  injectStyles();
  renderEditor();
  renderPreview();

  function renderEditor() {
    editorArea.innerHTML = "";
    
    const voiceGroup = h("div", { class: "vch-group" });
    voiceGroup.append(h("label", { class: "vch-label" }, "Brand Voice"));
    const voiceSelect = h("select", { class: "vch-input" });
    Object.entries(voices).forEach(([id, v]) => {
      voiceSelect.append(h("option", { value: id, selected: data.voice === id }, v.label));
    });
    voiceSelect.addEventListener("change", (e) => {
      data.voice = e.target.value;
      renderPreview();
    });
    voiceGroup.append(voiceSelect);
    editorArea.append(voiceGroup);

    const fields = [
      { id: "title", label: "Título da Matéria", type: "text", value: data.title, placeholder: "Ex: Nova ponte em União da Vitória..." },
      { id: "kicker", label: "Kicker / Chapéu", type: "text", value: data.kicker },
      { id: "date", label: "Data de Cobertura/Publicação", type: "date", value: data.date },
      { id: "time", label: "Hora", type: "time", value: data.time },
      { id: "content", label: "Conteúdo da Reportagem", type: "textarea", value: data.content, placeholder: "Escreva aqui os detalhes da matéria..." }
    ];

    fields.forEach(f => {
      const group = h("div", { class: "vch-group" });
      const label = h("label", { class: "vch-label" }, f.label);
      let input;
      
      if (f.type === "textarea") {
        input = h("textarea", { class: "vch-input", rows: 6, placeholder: f.placeholder }, f.value);
      } else {
        input = h("input", { class: "vch-input", type: f.type, value: f.value, placeholder: f.placeholder });
      }

      input.addEventListener("input", (e) => {
        data[f.id] = e.target.value;
        renderPreview();
      });

      group.append(label, input);
      editorArea.append(group);
    });

    const actions = h("div", { class: "vch-actions" });
    
    const btnCalendar = h("button", { 
      class: "btn btn--primary", 
      type: "button",
      onclick: addToCalendar
    }, "Agendar no Calendar");

    const btnCopy = h("button", { 
      class: "btn btn--ghost", 
      type: "button",
      onclick: copyReport
    }, "Copiar Matéria");

    actions.append(btnCalendar, btnCopy);
    editorArea.append(actions);
  }

  function renderPreview() {
    previewArea.innerHTML = "";
    
    const preview = h("div", { class: "cpw-preview-card" });
    const voice = voices[data.voice];
    
    const meta = h("div", { class: "cpw-preview-meta" }, [
      h("span", { class: "card__tag" }, data.kicker || "UM Vale"),
      h("span", { style: "margin-left: 10px; opacity: 0.5; font-size: 0.7rem;" }, `${formatDate(data.date)} ${data.time}`)
    ]);

    const title = h("h2", { class: "cpw-preview-title" }, voice.prefix + (data.title || "Título da Matéria"));
    const content = h("div", { class: "cpw-preview-content" }, data.content || "O conteúdo aparecerá aqui...");
    const footer = h("div", { class: "cpw-preview-footer" }, voice.suffix);

    preview.append(meta, title, content, footer);
    previewArea.append(preview);
  }

  function formatDate(d) {
    if (!d) return "";
    const parts = d.split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function copyReport() {
    const voice = voices[data.voice];
    const text = `${data.kicker}\n\n${voice.prefix}${data.title}\n\n${data.content}${voice.suffix}`;
    copyToClipboard(text);
    setToast("Copiado com Brand Voice!");
  }

  function addToCalendar() {
    const startDateTime = new Date(`${data.date}T${data.time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); 
    
    const format = (date) => date.toISOString().replace(/-|:|\.\d+/g, "");
    
    const voice = voices[data.voice];
    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action", "TEMPLATE");
    url.searchParams.set("text", `[MATÉRIA] ${data.title || "Nova Reportagem"}`);
    url.searchParams.set("dates", `${format(startDateTime)}/${format(endDateTime)}`);
    url.searchParams.set("details", `Kicker: ${data.kicker}\n\nConteúdo:\n${data.content}\n\nVoice: ${voice.label}`);
    
    window.open(url.toString(), "_blank");
    setToast("Abrindo Calendar...");
  }

  function injectStyles() {
    if (document.getElementById("copywriterStyles")) return;
    const style = document.createElement("style");
    style.id = "copywriterStyles";
    style.textContent = `
      .cpw-container { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; }
      @media (max-width: 768px) { .cpw-container { grid-template-columns: 1fr; } }
      
      .cpw-editor-area { display: flex; flex-direction: column; gap: 14px; }
      
      .cpw-preview-area { display: flex; align-items: flex-start; }
      
      .cpw-preview-card {
        width: 100%;
        background: #0d111d;
        border: 1px solid var(--stroke);
        border-radius: 12px;
        padding: 24px;
        box-shadow: var(--shadow);
      }
      
      .cpw-preview-meta { margin-bottom: 12px; display: flex; align-items: center; }
      .cpw-preview-title { 
        font-family: var(--font-head); 
        font-weight: 900; 
        font-size: 1.5rem; 
        line-height: 1.1; 
        letter-spacing: -0.03em;
        margin-bottom: 16px;
        color: #f5f2ec;
      }
      
      .cpw-preview-content { 
        font-family: var(--font-body); 
        font-size: 1rem; 
        line-height: 1.6; 
        color: rgba(245, 242, 236, 0.85);
        white-space: pre-wrap;
      }
      
      .cpw-preview-footer {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(245, 242, 236, 0.1);
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: var(--orange);
        white-space: pre-wrap;
      }

      select.vch-input { appearance: none; cursor: pointer; }
    `;
    document.head.appendChild(style);
  }
}
