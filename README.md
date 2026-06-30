# HEIM:SPIEL Data Collector – Installationsanleitung

---

## Was ist das und wozu brauche ich es?

Der HEIM:SPIEL Data Collector ist ein kleines Browser-Hilfsprogramm (ein sogenanntes „Userscript"). Es erscheint als kleines Widget unten rechts auf ProCyclingStats.com und sammelt Renndaten auf Knopfdruck – fertig formatiert als CSV für den Upload via AAA V2 Modul in die HEIM:SPIEL Datenbank. 

---

## Schritt 1 – Tampermonkey installieren

Tampermonkey ist eine kostenlose Browser-Erweiterung. Sie ist die „Hülle", in der das Script läuft.

### Google Chrome

1. Öffne diesen Link im Browser:  
   **https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo**
2. Klicke auf den blauen Button **„Hinzufügen"**
3. Im Popup auf **„Erweiterung hinzufügen"** klicken
4. Fertig – oben rechts im Browser erscheint das Tampermonkey-Symbol (schwarzes Quadrat mit zwei Kreisen)

### Mozilla Firefox

1. Öffne diesen Link:  
   **https://addons.mozilla.org/de/firefox/addon/tampermonkey/**
2. Klicke auf **„Zu Firefox hinzufügen"**
3. Im Popup auf **„Hinzufügen"** klicken
4. Fertig

> ⚠️ **Wichtig:** Tampermonkey muss nur **einmalig** installiert werden. Danach bleibt es dauerhaft aktiv.

---

## Schritt 2 – Das HEIM:SPIEL Script installieren

1. Öffne diesen Link im Browser:  
   **https://raw.githubusercontent.com/andim82/heimspiel-data-collector/main/HEIMSPIEL_DataCollector.user.js**

2. Tampermonkey erkennt das Script automatisch und öffnet einen Installations-Dialog

3. Klicke auf den grünen Button **„Installieren"**

4. Fertig! Das Script ist jetzt aktiv.

> ✅ Du musst das Script nur **einmalig** installieren. Updates werden automatisch eingespielt, sobald eine neue Version verfügbar ist.

---

## Schritt 3 – Script benutzen

1. Öffne **www.procyclingstats.com** und navigiere zu einem Rennen (z.B. Tour de France → Stage 1)

2. Unten rechts im Browserfenster erscheint das **HEIM:SPIEL Data Collector Widget** automatisch

3. Das Widget erkennt die Seite selbstständig und zeigt den passenden Datentyp an (z.B. „Stage", „GC", „Startliste")

4. die Daten werden sofort in die **Zwischenablage** kopiert und können mit STRG + V in das AAA V2 Modul eingefügt werden. Hinweis: das Output Format ist für das AAA V2 Modul optimiert und wird nicht im alten AAA V1 Upload Modul funktionieren.

---

## Was tun wenn das Widget nicht erscheint?

| Problem | Lösung |
|---|---|
| Widget nicht sichtbar | Prüfen ob du auf `procyclingstats.com/race/...` bist |
| Seite lädt, aber kein Widget | Seite neu laden mit **F5** |
| Tampermonkey-Symbol zeigt keine Zahl | Script ist inaktiv – siehe unten |
| Script steht nicht in der Liste | Script erneut installieren (Schritt 2) |

**Script aktivieren:** Tampermonkey-Symbol oben rechts anklicken → prüfen ob „HEIM:SPIEL Website Data Collector" in der Liste steht und ein **grüner Haken** daneben ist. Falls nicht: draufklicken zum Aktivieren.

---

## Updates

Das Script aktualisiert sich **automatisch**. Tampermonkey prüft regelmäßig ob eine neue Version verfügbar ist und spielt Updates still ein. Du musst nichts tun.

---

## Hilfe & Kontakt

Bei Fragen oder Problemen: Wende dich an andreas.meyer@heimspiel.de
