# DocsDocs, nur anders und besser

https://jogifau.github.io/Exams_app/

Noch zu implementieren: Nach Abfrage Falsch beantwortete noch mal wiederholen

## Daten
- `datasets/manifest.json` steuert die Datensätze im Dropdown.
- Pro Datensatz: `export.json` + optional `images.zip`.
- Zusätzlich je Datensatz: `notebookUrl` (NotebookLM-Link) im Manifest.

## Wichtige Hinweise
- Die App läuft komplett im Browser.
- Speicherung erfolgt lokal im Browser (localStorage) + optionaler Backup Export/Import.
