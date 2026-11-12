const localMaterials = [
  {
    id: "fractions",
    subject: "Maths",
    grade: "Grade 8–9",
    grades: [8, 9],
    title: "Fractions made friendly",
    description: "See how parts become wholes, and make adding fractions feel simple.",
    image: "maths",
    imageText: ["½ + ¼", "=", "¾"],
    href: "materials/fractions.html"
  },
  {
    id: "water-cycle",
    subject: "Science & technology",
    grade: "Grade 7–9",
    grades: [7, 8, 9],
    title: "The water cycle",
    description: "Follow a drop of water on its never-ending journey around Earth.",
    image: "science",
    imageText: ["☀", "↗", "☁", "↘"],
    href: "materials/water-cycle.html"
  },
  {
    id: "reading-clues",
    subject: "Languages & literacy",
    grade: "Grade 8–10",
    grades: [8, 9, 10],
    title: "Reading between the lines",
    description: "Use context clues to discover what a writer is really saying.",
    image: "english",
    imageText: ["“", "…", "”"],
    href: "materials/reading-clues.html"
  },
  {
    id: "web-basics",
    subject: "Digital skills",
    grade: "Getting started",
    grades: [],
    title: "How the web works",
    description: "A friendly first look at websites, browsers, and the internet.",
    image: "digital",
    imageText: ["www", "✳", ".za"],
    href: "materials/web-basics.html"
  }
];

const DBE_ORIGIN = "https://www.education.gov.za";
const storageKey = "learnza-saved-materials";
const grid = document.querySelector("#resource-grid");
const searchInput = document.querySelector("#search-input");
const gradeFilter = document.querySelector("#grade-filter");
const resultCount = document.querySelector("#result-count");
const savedCount = document.querySelector("#saved-count");
const savedToggle = document.querySelector("#saved-toggle");
const emptyState = document.querySelector("#empty-state");
const actionStatus = document.querySelector("#action-status");
const catalogUpdated = document.querySelector("#catalog-updated");
const connectionLabel = document.querySelector("#connection-label");
const offlineStatus = document.querySelector(".offline-status");
const nativeShareButton = document.querySelector("#native-share");
const copyShareLinkButton = document.querySelector("#copy-share-link");

let activeFilter = "All";
let showingSaved = false;
let materials = localMaterials;
let savedMaterials = loadSavedMaterials();

function loadSavedMaterials() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved) ? saved.filter(id => materials.some(material => material.id === id)) : [];
  } catch (error) {
    console.error("Could not read saved learning guides.", error);
    return [];
  }
}

function updateSavedCount() {
  savedCount.textContent = String(savedMaterials.length);
  savedToggle.setAttribute("aria-pressed", String(showingSaved));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function isOfficialMaterial(material) {
  try {
    const url = new URL(material.sourceUrl);
    return url.origin === DBE_ORIGIN && Number.isInteger(material.grade) && material.grade >= 1 && material.grade <= 12;
  } catch {
    return false;
  }
}

function renderMaterials() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedGrade = gradeFilter.value;
  const visibleMaterials = materials.filter(material => {
    const matchesSubject = activeFilter === "All" || material.subject === activeFilter;
    const matchesSaved = !showingSaved || savedMaterials.includes(material.id);
    const matchesGrade = selectedGrade === "all" || material.grades.includes(Number(selectedGrade));
    const matchesSearch = `${material.title} ${material.description} ${material.subject} ${material.grade}`.toLowerCase().includes(query);
    return matchesSubject && matchesSaved && matchesGrade && matchesSearch;
  });

  resultCount.textContent = String(visibleMaterials.length);
  emptyState.hidden = visibleMaterials.length > 0;
  grid.innerHTML = visibleMaterials.map(material => {
    const official = isOfficialMaterial(material);
    const isSaved = savedMaterials.includes(material.id);
    const gradeLabel = official ? material.gradeLabel : material.grade;
    const illustration = official
      ? `<span>DBE</span><span>${escapeHtml(material.year || "CAPS")}</span>`
      : material.imageText.map(text => `<span>${escapeHtml(text)}</span>`).join("");
    const cardActions = official
      ? `<a class="read-link" href="${escapeHtml(material.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open at DBE <span aria-hidden="true">↗</span></a><span class="source-label">OFFICIAL SOURCE</span>`
      : `<a class="read-link" href="${escapeHtml(material.href)}">Read guide <span aria-hidden="true">→</span></a>
          <button class="save-button${isSaved ? " is-saved" : ""}" type="button" data-id="${escapeHtml(material.id)}" aria-pressed="${isSaved}" aria-label="${isSaved ? "Remove" : "Save"} ${escapeHtml(material.title)} ${isSaved ? "from" : "for"} offline reading">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4.8c0-.44.36-.8.8-.8h10.4c.44 0 .8.36.8.8V21l-6.8-4-6.8 4V4.8Z"></path></svg>
            ${isSaved ? "Saved" : "Save offline"}
          </button>`;
    const updated = official && formatDate(material.updatedAt)
      ? `<p class="resource-updated">DBE · Updated ${escapeHtml(formatDate(material.updatedAt))}</p>`
      : "";
    return `
      <article class="resource-card">
        <div class="card-meta">
          <span class="subject-tag" data-subject="${escapeHtml(material.subject)}"><span class="subject-dot"></span>${escapeHtml(material.subject)}</span>
          <span class="grade-tag">${escapeHtml(gradeLabel)}</span>
        </div>
        <div class="card-illustration ${official ? "official" : escapeHtml(material.image)}" aria-hidden="true">${illustration}</div>
        <h3>${escapeHtml(material.title)}</h3>
        <p class="card-description">${escapeHtml(material.description)}</p>
        ${updated}
        <div class="card-actions">${cardActions}</div>
      </article>`;
  }).join("");
  const count = visibleMaterials.length;
  document.querySelector("#result-label").textContent = count === 1 ? "learning material" : "learning materials";
  updateSavedCount();
}

function loadDbeMaterials() {
  try {
    const catalogue = window.LEARNZA_DBE_CATALOGUE;
    if (!Array.isArray(catalogue.resources)) throw new Error("The DBE catalogue has an invalid format.");
    const officialMaterials = catalogue.resources
      .filter(isOfficialMaterial)
      .map(material => ({ ...material, grades: [material.grade] }));
    materials = [...localMaterials, ...officialMaterials];
    const updated = formatDate(catalogue.updatedAt);
    catalogUpdated.textContent = updated
      ? `Official DBE links · refreshed ${updated}`
      : "Official DBE learning materials";
    renderMaterials();
  } catch (error) {
    console.error("Could not load the DBE learning catalogue.", error);
    catalogUpdated.textContent = "The latest DBE catalogue is temporarily unavailable.";
    actionStatus.textContent = "The DBE catalogue file is missing or invalid. Reload the page, or ask the site administrator to refresh the catalogue.";
  }
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  connectionLabel.textContent = online ? "You're online" : "You're offline";
  offlineStatus.classList.toggle("is-offline", !online);
}

function configureShareLinks() {
  const shareUrl = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const shareTitle = "LearnZA — Learning belongs to everyone";
  const shareText = "Free South African learning resources for Grades 1–12. Every child belongs.";
  const setShareLink = (service, href) => {
    const link = document.querySelector(`[data-share-service="${service}"]`);
    if (link) link.href = href;
  };
  const facebook = new URL("https://www.facebook.com/sharer/sharer.php");
  facebook.searchParams.set("u", shareUrl);
  setShareLink("facebook", facebook.href);

  const x = new URL("https://twitter.com/intent/tweet");
  x.searchParams.set("text", shareTitle);
  x.searchParams.set("url", shareUrl);
  setShareLink("x", x.href);

  const whatsapp = new URL("https://wa.me/");
  whatsapp.searchParams.set("text", `${shareTitle} ${shareUrl}`);
  setShareLink("whatsapp", whatsapp.href);

  const linkedin = new URL("https://www.linkedin.com/sharing/share-offsite/");
  linkedin.searchParams.set("url", shareUrl);
  setShareLink("linkedin", linkedin.href);

  const telegram = new URL("https://t.me/share/url");
  telegram.searchParams.set("url", shareUrl);
  telegram.searchParams.set("text", shareTitle);
  setShareLink("telegram", telegram.href);

  const email = new URL("mailto:");
  email.searchParams.set("subject", shareTitle);
  email.searchParams.set("body", `${shareText} ${shareUrl}`);
  setShareLink("email", email.href);

  if (typeof navigator.share === "function") {
    nativeShareButton.hidden = false;
    nativeShareButton.addEventListener("click", async () => {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Could not share LearnZA.", error);
          actionStatus.textContent = "LearnZA could not be shared. Please choose another sharing option.";
        }
      }
    });
  }

  copyShareLinkButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      actionStatus.textContent = "LearnZA link copied.";
    } catch (error) {
      console.error("Could not copy the LearnZA link.", error);
      actionStatus.textContent = "The link could not be copied. Please use one of the other sharing options.";
    }
  });
}

async function sendWorkerMessage(message) {
  const registration = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller || registration.active;
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error("Offline storage is not ready yet. Please try again in a moment."));
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = event => {
      if (event.data?.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

grid.addEventListener("click", async event => {
  const button = event.target.closest(".save-button");
  if (!button) return;

  const material = materials.find(item => item.id === button.dataset.id);
  if (!material) return;
  button.disabled = true;
  const isSaved = savedMaterials.includes(material.id);

  try {
    actionStatus.textContent = "";
    if (isSaved) {
      await sendWorkerMessage({ type: "REMOVE_MATERIAL", url: material.href });
      savedMaterials = savedMaterials.filter(id => id !== material.id);
    } else {
      await sendWorkerMessage({ type: "SAVE_MATERIAL", url: material.href });
      savedMaterials = [...savedMaterials, material.id];
    }
    localStorage.setItem(storageKey, JSON.stringify(savedMaterials));
    renderMaterials();
  } catch (error) {
    console.error("Could not update offline guide.", error);
    actionStatus.textContent = error.message;
    button.disabled = false;
    button.setAttribute("aria-label", error.message);
    button.title = error.message;
  }
});

searchInput.addEventListener("input", renderMaterials);
gradeFilter.addEventListener("change", renderMaterials);
document.querySelectorAll(".filter-chip").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelector(".filter-chip.selected")?.classList.remove("selected");
    button.classList.add("selected");
    renderMaterials();
  });
});
savedToggle.addEventListener("click", () => {
  showingSaved = !showingSaved;
  renderMaterials();
});
document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(() => {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      grid.querySelectorAll(".save-button").forEach(button => { button.disabled = false; });
    });
  }).catch(error => {
    console.error("LearnZA could not enable offline support.", error);
  });
}

updateConnectionStatus();
configureShareLinks();
renderMaterials();
loadDbeMaterials();
