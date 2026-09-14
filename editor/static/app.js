"use strict";

const typeLabels = {
  researchers: "基本情報",
  research_experience: "経歴",
  education: "学歴",
  research_areas: "研究分野",
  research_interests: "研究キーワード",
  association_memberships: "所属学協会",
  committee_memberships: "委員歴",
  published_papers: "論文",
  presentations: "講演・口頭発表",
  awards: "受賞",
  works: "Works",
  academic_contribution: "社会貢献活動",
};

const state = {
  meta: null,
  records: [],
  mode: null,
  type: null,
  index: null,
  original: null,
  sourceHash: null,
  pendingMerge: null,
};

const $ = (selector) => document.querySelector(selector);
const homeScreen = $("#home-screen");
const addPicker = $("#add-picker");
const editPicker = $("#edit-picker");
const formScreen = $("#form-screen");
const structuredForm = $("#structured-form");
const rawForm = $("#raw-form");
const dialog = $("#confirmation-dialog");

async function request(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try { payload = await response.json(); } catch { /* no JSON response */ }
  if (!response.ok) throw new Error(payload.error || `通信エラー (${response.status})`);
  return payload;
}

function setScreen(name) {
  homeScreen.hidden = name !== "home";
  addPicker.hidden = name !== "add-picker";
  editPicker.hidden = name !== "edit-picker";
  formScreen.hidden = name !== "form";
  $("#home-button").hidden = name === "home";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showStatus(message, error = false) {
  const status = $("#save-status");
  status.textContent = message;
  status.className = `status ${error ? "error" : "success"}`;
  status.hidden = false;
}

function localized(value, language) {
  return value && typeof value === "object" ? value[language] || "" : "";
}

function contributorLines(value, language) {
  const items = value && typeof value === "object" ? value[language] : null;
  return Array.isArray(items) ? items.map((item) => item.name || "").filter(Boolean).join("\n") : "";
}

function parseContributors(value) {
  return value.split("\n").map((name) => name.trim()).filter(Boolean).map((name) => ({ name }));
}

function triState(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function assignText(object, key, value) {
  const clean = String(value || "").trim();
  if (clean) object[key] = clean;
  else delete object[key];
}

function assignBoolean(object, key, value) {
  const parsed = triState(value);
  if (parsed === null) delete object[key];
  else object[key] = parsed;
}

function assignLocalized(object, key, japanese, english) {
  const result = {};
  if (String(japanese || "").trim()) result.ja = String(japanese).trim();
  if (String(english || "").trim()) result.en = String(english).trim();
  if (Object.keys(result).length) object[key] = result;
  else delete object[key];
}

function assignContributors(object, key, japanese, english) {
  const result = {};
  const ja = parseContributors(japanese || "");
  const en = parseContributors(english || "");
  if (ja.length) result.ja = ja;
  if (en.length) result.en = en;
  if (Object.keys(result).length) object[key] = result;
  else delete object[key];
}

function formValue(name) {
  return structuredForm.elements[name].value;
}

function resetStructuredForm() {
  structuredForm.reset();
  structuredForm.elements.display.value = "disclosed";
  structuredForm.elements.language.value = "ja";
}

function configureStructuredType(type) {
  state.type = type;
  $("#paper-fields").hidden = type !== "published_papers";
  $("#presentation-fields").hidden = type !== "presentations";
  const label = typeLabels[type];
  $("#form-heading").textContent = state.mode === "add" ? `新しい${label}を作成` : `${label}を編集`;
  $("#form-description").textContent = "日本語・英語の両方を持つ項目は、必要な言語だけ入力できます。";
}

function urlsFromMerge(merge) {
  return (merge.see_also || [])
    .filter((item) => item && item["@id"] && item.label !== "doi")
    .map((item) => item["@id"])
    .join("\n");
}

function populateStructured(document) {
  resetStructuredForm();
  const merge = document.merge;
  const paper = state.type === "published_papers";
  const title = merge[paper ? "paper_title" : "presentation_title"] || {};
  const contributors = merge[paper ? "authors" : "presenters"] || {};
  structuredForm.elements.language.value = (merge.languages || []).includes("eng") ? "en" : "ja";
  structuredForm.elements.display.value = merge.display || "disclosed";
  structuredForm.elements.title_ja.value = localized(title, "ja");
  structuredForm.elements.title_en.value = localized(title, "en");
  structuredForm.elements.contributors_ja.value = contributorLines(contributors, "ja");
  structuredForm.elements.contributors_en.value = contributorLines(contributors, "en");
  structuredForm.elements.publication_date.value = merge.publication_date || "";
  structuredForm.elements.major_achievement.checked = merge.major_achievement === true;
  structuredForm.elements.description_ja.value = localized(merge.description, "ja");
  structuredForm.elements.description_en.value = localized(merge.description, "en");
  structuredForm.elements.urls.value = urlsFromMerge(merge);
  if (paper) {
    structuredForm.elements.venue_ja.value = localized(merge.publication_name, "ja");
    structuredForm.elements.venue_en.value = localized(merge.publication_name, "en");
    ["published_paper_type", "volume", "number", "starting_page", "ending_page", "publisher"].forEach((name) => {
      structuredForm.elements[name].value = merge[name] || "";
    });
    structuredForm.elements.referee.value = merge.referee === undefined || merge.referee === null ? "" : String(merge.referee);
    structuredForm.elements.invited.value = merge.invited === undefined || merge.invited === null ? "" : String(merge.invited);
    structuredForm.elements.doi.value = merge.identifiers?.doi?.[0] || "";
  } else {
    structuredForm.elements.event_ja.value = localized(merge.event, "ja");
    structuredForm.elements.event_en.value = localized(merge.event, "en");
    structuredForm.elements.presentation_type.value = merge.presentation_type || "";
    structuredForm.elements.presentation_invited.value = merge.invited === undefined || merge.invited === null ? "" : String(merge.invited);
  }
}

function mergeFromStructured() {
  const merge = state.original ? structuredClone(state.original.merge) : {};
  const paper = state.type === "published_papers";
  const language = formValue("language");
  merge.display = formValue("display");
  merge.major_achievement = structuredForm.elements.major_achievement.checked;
  merge.languages = [language === "en" ? "eng" : "jpn"];
  assignLocalized(merge, paper ? "paper_title" : "presentation_title", formValue("title_ja"), formValue("title_en"));
  assignContributors(merge, paper ? "authors" : "presenters", formValue("contributors_ja"), formValue("contributors_en"));
  assignText(merge, "publication_date", formValue("publication_date"));
  assignLocalized(merge, "description", formValue("description_ja"), formValue("description_en"));
  const urls = formValue("urls").split("\n").map((url) => url.trim()).filter(Boolean);
  const retainedLinks = (merge.see_also || []).filter((item) => item?.label === "doi");
  const urlLinks = urls.map((url) => ({ label: "url", "@id": url, is_downloadable: false }));
  if (retainedLinks.length || urlLinks.length) merge.see_also = [...retainedLinks, ...urlLinks];
  else delete merge.see_also;
  if (paper) {
    assignLocalized(merge, "publication_name", formValue("venue_ja"), formValue("venue_en"));
    ["published_paper_type", "volume", "number", "starting_page", "ending_page", "publisher"].forEach((name) => assignText(merge, name, formValue(name)));
    assignBoolean(merge, "referee", formValue("referee"));
    assignBoolean(merge, "invited", formValue("invited"));
    const doi = formValue("doi").trim();
    const identifiers = structuredClone(merge.identifiers || {});
    if (doi) identifiers.doi = [doi];
    else delete identifiers.doi;
    if (Object.keys(identifiers).length) merge.identifiers = identifiers;
    else delete merge.identifiers;
    const linksWithoutDoi = (merge.see_also || []).filter((item) => item?.label !== "doi");
    if (doi) linksWithoutDoi.unshift({ label: "doi", "@id": `https://doi.org/${doi}`, is_downloadable: false });
    if (linksWithoutDoi.length) merge.see_also = linksWithoutDoi;
    else delete merge.see_also;
  } else {
    assignLocalized(merge, "event", formValue("event_ja"), formValue("event_en"));
    assignText(merge, "presentation_type", formValue("presentation_type"));
    assignBoolean(merge, "invited", formValue("presentation_invited"));
  }
  return merge;
}

function openNew(type) {
  state.mode = "add";
  state.index = null;
  state.original = null;
  resetStructuredForm();
  configureStructuredType(type);
  structuredForm.hidden = false;
  rawForm.hidden = true;
  $("#form-mode").textContent = "新規作成";
  $("#save-status").hidden = true;
  setScreen("form");
}

async function openEdit(index) {
  try {
    const payload = await request(`/api/record?index=${encodeURIComponent(index)}`);
    state.mode = "edit";
    state.index = payload.index;
    state.original = payload.document;
    state.sourceHash = payload.file_hash;
    state.type = payload.document.insert.type;
    $("#form-mode").textContent = `既存編集 · ID ${payload.document.insert.id || "未採番"}`;
    $("#save-status").hidden = true;
    if (["published_papers", "presentations"].includes(state.type)) {
      configureStructuredType(state.type);
      populateStructured(payload.document);
      structuredForm.hidden = false;
      rawForm.hidden = true;
    } else {
      $("#form-heading").textContent = `${typeLabels[state.type] || state.type}を編集`;
      $("#form-description").textContent = "researchmapのmerge構造を保持したまま編集します。";
      $("#raw-json").value = JSON.stringify(payload.document.merge, null, 2);
      structuredForm.hidden = true;
      rawForm.hidden = false;
    }
    setScreen("form");
  } catch (error) {
    $("#record-count").textContent = error.message;
  }
}

function renderRecords() {
  const type = $("#type-filter").value;
  const query = $("#search-input").value.trim().toLocaleLowerCase("ja");
  const records = state.records
    .filter((record) => !type || record.type === type)
    .filter((record) => !query || `${record.title} ${record.contributors}`.toLocaleLowerCase("ja").includes(query))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)) || left.index - right.index);
  const list = $("#record-list");
  list.replaceChildren();
  records.forEach((record) => {
    const fragment = $("#record-template").content.cloneNode(true);
    const button = fragment.querySelector("button");
    fragment.querySelector(".record-meta").textContent = `${typeLabels[record.type] || record.type} · ${record.date || "日付なし"} · ID ${record.id || "未採番"}`;
    fragment.querySelector(".record-title").textContent = record.title;
    fragment.querySelector(".record-contributors").textContent = record.contributors;
    button.addEventListener("click", () => openEdit(record.index));
    list.append(fragment);
  });
  $("#record-count").textContent = `${records.length}件を表示（全${state.records.length}件）`;
}

async function loadRecords() {
  const payload = await request("/api/records");
  state.records = payload.records;
  state.sourceHash = payload.file_hash;
  renderRecords();
}

function confirmMerge(merge) {
  state.pendingMerge = merge;
  $("#confirmation-json").textContent = JSON.stringify(merge, null, 2);
  dialog.showModal();
}

structuredForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!structuredForm.reportValidity()) return;
  const merge = mergeFromStructured();
  const title = merge[state.type === "published_papers" ? "paper_title" : "presentation_title"] || {};
  const contributors = merge[state.type === "published_papers" ? "authors" : "presenters"] || {};
  if (!title.ja && !title.en) return showStatus("タイトルは日本語または英語が必須です。", true);
  if (!contributors.ja?.length && !contributors.en?.length) return showStatus("著者・発表者を1名以上入力してください。", true);
  confirmMerge(merge);
});

rawForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const merge = JSON.parse($("#raw-json").value);
    if (!merge || Array.isArray(merge) || typeof merge !== "object") throw new Error("mergeはJSONオブジェクトにしてください。");
    confirmMerge(merge);
  } catch (error) {
    showStatus(`JSONを確認してください: ${error.message}`, true);
  }
});

$("#confirm-save").addEventListener("click", async () => {
  const button = $("#confirm-save");
  button.disabled = true;
  try {
    const options = {
      method: state.mode === "add" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json", "X-Editor-Token": state.meta.write_token },
      body: JSON.stringify(state.mode === "add"
        ? { source_hash: state.sourceHash, document: { insert: { type: state.type, user_id: state.meta.user_id }, merge: state.pendingMerge } }
        : { source_hash: state.sourceHash, index: state.index, merge: state.pendingMerge }),
    };
    const result = await request("/api/records", options);
    dialog.close();
    state.sourceHash = result.file_hash;
    await initialize();
    setScreen("home");
    $("#load-status").textContent = `${result.message} ポートフォリオ表示とエクスポートへ反映済みです。`;
    $("#load-status").className = "status success";
  } catch (error) {
    dialog.close();
    showStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#cancel-save").addEventListener("click", () => dialog.close());
$("#home-button").addEventListener("click", () => setScreen("home"));
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", async () => {
  if (button.dataset.mode === "add") setScreen("add-picker");
  else { setScreen("edit-picker"); await loadRecords(); }
}));
document.querySelectorAll("[data-new-type]").forEach((button) => button.addEventListener("click", () => openNew(button.dataset.newType)));
$("#type-filter").addEventListener("change", renderRecords);
$("#search-input").addEventListener("input", renderRecords);

async function initialize() {
  state.meta = await request("/api/meta");
  state.sourceHash = state.meta.file_hash;
  $("#load-status").textContent = `${state.meta.data_file} から ${state.meta.total}件を読み込みました。`;
  $("#load-status").className = "status success";
  document.querySelectorAll("[data-mode]").forEach((button) => { button.disabled = false; });
  const filter = $("#type-filter");
  if (filter.options.length === 1) {
    Object.keys(state.meta.counts).forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = `${typeLabels[type] || type}（${state.meta.counts[type]}件）`;
      filter.append(option);
    });
  }
}

initialize().catch((error) => {
  $("#load-status").textContent = `初期化できませんでした: ${error.message}`;
  $("#load-status").className = "status error";
});
