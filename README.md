# Exam Generator (DocsDocs, nur anders und besser)

Statische, browserbasierte Lern- und Prüfungs-App für Klausurfragen – optimiert für GitHub Pages.

🌐 Live-Demo: https://jogifau.github.io/Exams_app/

---

## Inhaltsverzeichnis

- [Projektüberblick](#projektüberblick)
- [Hauptfunktionen](#hauptfunktionen)
- [Architektur & Technologie](#architektur--technologie)
- [Projektstruktur](#projektstruktur)
- [Schnellstart (lokal)](#schnellstart-lokal)
- [Datenmodell](#datenmodell)
- [Datensätze über `manifest.json`](#datensätze-über-manifestjson)
- [Workflows & Zustände](#workflows--zustände)
- [Filterlogik](#filterlogik)
- [Session- und Ergebnis-Speicherung (localStorage)](#session--und-ergebnis-speicherung-localstorage)
- [NotebookLM-Integration](#notebooklm-integration)
- [Theme-System](#theme-system)
- [Backup/Restore](#backuprestore)
- [Deployment auf GitHub Pages](#deployment-auf-github-pages)
- [Fehlersuche](#fehlersuche)
- [Erweiterungsideen](#erweiterungsideen)
- [Entwicklungsrichtlinien](#entwicklungsrichtlinien)

---

## Projektüberblick

Diese Anwendung ist ein **reines Frontend-Projekt ohne Backend**. Ziel ist es, Klausurfragen sofort nutzbar zu machen (Zero-Install): URL öffnen, Datensatz auswählen, loslegen.

Wichtige Ziele:

- **Einfacher Zugang**: Keine Anmeldung, keine Serverabhängigkeiten.
- **Robuste Lernflows**: Klare Trennung zwischen Konfiguration, Abfrage, Suchmodus und Auswertung.
- **Datenschutzfreundlich**: Fortschritt bleibt lokal im Browser (`localStorage`).
- **Wartbar**: Vanilla ES Modules, kein Build-Step, keine schweren Frameworks.

---

## Hauptfunktionen

### 1) Datensatz-Auswahl über Manifest
- Datensätze werden über `datasets/manifest.json` bereitgestellt.
- Unterstützt ein oder mehrere JSON-Quellen pro Datensatz.
- Optional: ZIP mit Bildern pro Datensatz.

### 2) Zwei Arbeitsmodi
- **Abfragemodus** (`quiz`): klassische Beantwortung mit Abschluss und Review.
- **Suchmodus** (`search`): freies Durchsuchen mit Suchbegriffen und Filtern.

### 3) Umfangreiche Filter
- Nach Klausur (`examName`)
- Nach Thema/Unterthema (AI-Topics)
- Nach Bildstatus (mit/ohne Bilder)
- Nur zuletzt falsch beantwortete Fragen
- Zufalls-Subset + optionales Mischen
- Volltextsuche (Frage + optional Antworten)

### 4) Persistenz
- Speichert Sessions pro Datensatz lokal.
- Fortschritt und Ergebnisse bleiben beim Reload erhalten.
- Backup/Restore der lokalen Sessiondaten möglich.

### 5) NotebookLM
- Button „In NotebookLM erklären“ pro Frage.
- Verwendet ausschließlich die im Manifest definierte `notebookUrl`.

---

## Architektur & Technologie

- **Frontend**: HTML + CSS + Vanilla JavaScript (ES Modules)
- **Hosting**: GitHub Pages (statisch)
- **Persistenz**: Browser `localStorage`
- **Bildhandling**: ZIP im Browser über JSZip (Blob-URLs)
- **Kein Build-Tooling erforderlich**

Initialisierung (`src/main.js`):
1. Theme laden
2. Manifest laden
3. Dataset-Dropdown befüllen
4. Event-Handler verbinden
5. Initiales Rendering

---

## Projektstruktur

```text
.
├─ index.html                  # App-Struktur + IDs/Anker für JS
├─ assets/
│  ├─ styles.css               # Globales Styling + responsive Regeln
│  ├─ Theme_Spezi.json         # Theme-Tokens
│  └─ theme_dark_mode.json     # Theme-Tokens
├─ datasets/
│  ├─ manifest.json            # Datensatz-Definitionen
│  ├─ informatik/
│  └─ mibi_prac/
└─ src/
   ├─ main.js                  # Bootstrap
   ├─ state.js                 # Zentraler App-State
   ├─ theme.js                 # Theme-Laden/Anwenden
   ├─ utils.js                 # UI-Hilfen
   ├─ data/
   │  ├─ manifest.js           # Manifest-Lade-/Select-Logik
   │  ├─ loaders.js            # JSON laden + Fragen normalisieren
   │  ├─ zipImages.js          # ZIP laden + Bilder auflösen
   │  └─ storage.js            # Session-Persistenz + Backup
   ├─ quiz/
   │  ├─ filters.js            # Filter/Suche/Shuffle/Random
   │  ├─ evaluate.js           # Auswertung von Antworten
   │  └─ session.js            # Session-Lifecycle
   ├─ ui/
   │  ├─ events.js             # Event-Wiring + Moduswechsel
   │  ├─ render.js             # Rendering + Review/Analytics
   │  └─ components.js         # UI-Komponenten
   ├─ export/csv.js            # CSV-Export
   └─ rules/questionPresentationRules.js
```

---

## Schnellstart (lokal)

> Wichtig: Nicht über `file://` öffnen, da ES Modules sonst oft blockiert werden.

```bash
python -m http.server 8000
```

Danach im Browser öffnen:

```text
http://localhost:8000/
```

---

## Datenmodell

Die Ladepipeline normalisiert Rohdaten in ein konsistentes Fragenmodell.

### Erwartete Kernfelder pro Frage

- `id` (string, stabil)
- `questionText` (im Code als `text` normalisiert)
- `answers[]` mit `text`
- `correctIndices[]`
- `examName`
- optional `imageFiles[]`
- optional `explanationText`

### Erweiterte/AI-bezogene Felder (optional)

- `aiSuperTopic`, `aiSubtopic`
- `aiAnswerConfidence`
- `aiAudit.answerPlausibility.*`
- `originalCorrectIndices`, `finalCorrectIndices`
- Quellen-/Evidence-Felder für AI-Begründung

Die Normalisierung in `src/data/loaders.js` sorgt dafür, dass auch heterogene Datenquellen robust verarbeitet werden.

---

## Datensätze über `manifest.json`

`datasets/manifest.json` enthält ein `datasets[]`-Array.

### Felder je Datensatz

- `id`: eindeutiger, stabiler Schlüssel (auch für localStorage-Namespace)
- `label`: sichtbarer Name im Dropdown
- `json`: URL-String oder Array von URL-Strings
- `zip` (optional): Pfad zu Bild-ZIP
- `notebookUrl` (optional): NotebookLM-Ziel

### Beispiel

```json
{
  "id": "informatik roh",
  "label": "Informatik",
  "json": ["datasets/informatik/export_AIannotated.json"],
  "zip": "datasets/informatik/images.zip",
  "notebookUrl": "https://notebooklm.google.com/notebook/..."
}
```

---

## Workflows & Zustände

Der App-State kennt vier Views:

- `config`: Konfiguration (Datensatz + Filter)
- `quiz`: aktive Abfrage
- `review`: abgeschlossene Abfrage mit Auswertung
- `search`: Suchmodus

### Typischer Quiz-Flow

1. Datensatz laden
2. Filter setzen
3. Quiz starten
4. Antworten einreichen
5. Quiz beenden
6. Review inkl. korrekter/falscher Markierung

### Typischer Search-Flow

1. Datensatz laden
2. Such- und Themenfilter setzen
3. Fragen durchsuchen (optional mit Lösungen)
4. Zurück zur Konfiguration

Beim Wechsel zurück zur Konfiguration werden Filter gezielt zurückgesetzt, um „stale state“ zu vermeiden.

---

## Filterlogik

Die Filterung erfolgt schrittweise:

1. Klausuren (`filterByExams`)
2. Themen (`filterByTopics`)
3. Bildmodus (`filterByImageMode`)
4. Optional „nur falsch beantwortete“
5. Optional Suche (`searchQuestions`)
6. Optional Zufallsbegrenzung + Shuffle (`applyRandomAndShuffle`)

Wichtig: Im Quiz wird eine feste Fragenreihenfolge pro Session gespeichert, damit Ergebnisse reproduzierbar bleiben.

---

## Session- und Ergebnis-Speicherung (localStorage)

- Prefix: `examgen:v1:`
- Schlüssel je Datensatz: `examgen:v1:sessions:<datasetId>`
- Gespeichert werden u. a.:
  - Konfiguration
  - Fragenreihenfolge
  - Antworten
  - Abgegebene Fragen (`submitted`)
  - Ergebnisse (`results`)
  - Zeitstempel (`createdAt`, `updatedAt`, `finishedAt`)

Zusätzlich wird aus den letzten abgeschlossenen Quiz-Sessions ein „zuletzt beantwortet“/„zuletzt falsch“ Bild für die Filterfunktion berechnet.

---

## NotebookLM-Integration

- Die URL kommt **ausschließlich** aus dem aktuell aktiven Datensatz (`manifest.json`).
- Die Aktion öffnet NotebookLM in neuem Tab/Fenster.
- Kontext (Frage/Antwort/Hinweis) kann für Explain-Workflows genutzt werden.

Kein Hardcoding von NotebookLM-Links im Code.

---

## Theme-System

- Theme-Auswahl über UI (`themeSelect`)
- Tokens werden aus JSON-Dateien im `assets/`-Ordner geladen
- Aktives Theme beeinflusst Farben und Darstellung zentral

Damit sind visuelle Anpassungen möglich, ohne Rendering-Logik umzubauen.

---

## Backup/Restore

Über die Einstellungen kann ein JSON-Backup aller Sessiondaten exportiert bzw. importiert werden.

- **Export**: sammelt alle `examgen:v1:sessions:*`-Einträge
- **Import**: schreibt kompatible Schlüssel zurück ins `localStorage`
- **Clear**: entfernt Sessiondaten über den definierten Prefix

Hinweis: Backup-Dateien können personenbezogene Lernhistorie enthalten (lokal behandeln).

---

## Deployment auf GitHub Pages

Da die App statisch ist, genügt das Bereitstellen der Dateien im Repository.

Wichtig:
- Relative Pfade beibehalten
- Keine serverseitigen Features voraussetzen
- Datensatz-JSON/ZIP öffentlich erreichbar halten

---

## Fehlersuche

### Datensatz lädt nicht
- `manifest.json` auf korrekte Pfade prüfen
- Browser-Konsole auf HTTP-Fehler (`404`, `500`) prüfen
- CORS/Origin prüfen (nicht via `file://` starten)

### Bilder werden nicht angezeigt
- ZIP-URL im Manifest korrekt?
- Dateinamen in `imageFiles[]` entsprechen dem Inhalt der ZIP?

### Leere Ergebnismengen
- Filter zurücksetzen
- „Nur falsch beantwortete Fragen“ deaktivieren (wenn aktuell keine falschen vorhanden sind)

---

## Erweiterungsideen

- Wiederholung nur falsch beantworteter Fragen direkt nach Abschluss
- Mehr Exportformate (z. B. Markdown/PDF-Zusammenfassung)
- Erweiterte Analytics (Themen-Heatmaps, Verlauf pro Session)
- Optionaler Prompt-Copy-Button für NotebookLM

---

## Entwicklungsrichtlinien

- Kleine, lokale Änderungen statt großer Refactors
- IDs/Anker in `index.html` stabil halten (oder JS konsequent mitziehen)
- Bei Workflow-Änderungen immer **UI + Logik** gemeinsam anpassen
- Vor Merge prüfen:
  - App startet lokal fehlerfrei
  - Datensatz lädt
  - Quiz-Start/Ende/Abbruch funktioniert
  - Suchmodus funktioniert inkl. Rückkehr
  - Ergebnisse/Filter verhalten sich konsistent

---

## Lizenz / Hinweis

Dieses Projekt ist für Lern- und Trainingszwecke gedacht. Rechte an den Quelldaten (Klausurfragen, Bilder, Materialien) sind separat zu betrachten.
