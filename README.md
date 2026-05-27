# Audencia – Suivi budgétaire marketing

Application web locale qui lit un classeur Excel budgétaire (SharePoint si
configuré, sinon fichier local), agrège les données par service marketing et les
affiche dans un dashboard sobre, institutionnel, exportable en PDF — à la charte
Audencia.

- **Frontend** : React + Vite + TypeScript
- **Backend**  : Node.js + Express + ExcelJS (lecture en streaming)
- **Export**   : PDF généré côté navigateur (html2canvas + jsPDF)

---

## 1. Pré-requis

- Node.js ≥ 18 (testé sur Node 22)
- npm ≥ 9

## 2. Installation

À la racine du projet :

```bash
npm install                  # installe `concurrently` (racine)
npm run install:all          # installe les dépendances du backend et du frontend
```

## 3. Source du fichier Excel

Le backend résout la source dans cet ordre de priorité :

1. **`BUDGET_FILE_URL`** — URL réellement téléchargeable du classeur (ex. lien de
   téléchargement direct SharePoint/OneDrive ou point de terminaison Graph API).
   Jeton d'authentification optionnel via **`BUDGET_FILE_TOKEN`** (envoyé en
   `Authorization: Bearer …`). Aucun secret n'est codé en dur.
2. **`BUDGET_FILE_PATH`** — chemin local explicite vers le fichier, par exemple le
   dossier OneDrive synchronisé depuis SharePoint.
3. **`/data/*.xlsx`** — premier classeur trouvé dans `data/` (mode démo).

> ⚠️ Un **lien de partage SharePoint** classique (`…/:x:/s/…`) n'est **pas**
> téléchargeable directement sans authentification. Si la récupération distante
> échoue (page de login HTML, 401/403…), l'application **bascule proprement** sur
> le fallback local et affiche une erreur claire si aucun fallback n'est
> disponible.

### Configurer un chemin local synchronisé (recommandé)

```bash
# Linux/macOS
export BUDGET_FILE_PATH="/chemin/vers/OneDrive/.../Budget.xlsx"

# Windows (PowerShell)
$env:BUDGET_FILE_PATH="C:\Users\moi\OneDrive - Audencia\...\Budget.xlsx"
```

Voir `.env.example` pour la liste complète des variables.

## 4. Lancer l'application

```bash
npm run dev
```

- backend : `http://localhost:4000` (endpoint `/api/budget`)
- frontend : `http://localhost:5173`

Ouvrez **http://localhost:5173**. Le frontend appelle `/api/budget` via le proxy
Vite, rien à configurer.

```bash
npm run dev:server     # backend seul
npm run dev:frontend   # frontend seul
```

## 5. Utilisation

1. Le dashboard charge les données une seule fois (loader « Analyse du fichier
   budgétaire en cours… »).
2. Filtres **Global** / par service : changement de vue **instantané** (aucun
   nouvel appel API, aucun recalcul lourd côté client).
3. Commentaire libre par vue, conservé pendant la session du navigateur.
4. **Exporter en PDF** : logo, titre, date, KPI, barre d'avancement, commentaire
   et tableau de détail (totaux par service + total général en vue Global).

---

## Modèle de données (règles 2026)

Seuls **deux onglets** sont lus, **tous les autres sont ignorés** :

### Onglet `CONSO` — consommé / fléché

| Donnée   | Source              |
|----------|---------------------|
| Service  | en-tête **« Pôle »** (ou « Service ») |
| Partie   | en-tête **« Partie »** |
| Ensemble | en-tête **« Ensemble »** |
| Consommé | en-tête **« CONSOMME »** |
| Fléché   | en-tête **« FLECHE »** |

Granularité du détail = **Partie — Ensemble**. Les lignes de même
`service + partie + ensemble` sont regroupées (somme du consommé et du fléché,
compteur de lignes sources).

### Onglet `BUDGET` — budget dédié

| Donnée       | Source |
|--------------|--------|
| Service      | en-tête **« Pôle »** (ou « Service ») |
| Budget dédié | colonne année **« B20xx »** (sinon « Budget ») |

Le budget dédié est sommé **par service** et sert de budget de référence.

> **Résolution par en-tête plutôt que par lettre figée.** Le cahier des charges
> cible le fichier SharePoint (CONSO `Q/U/V`, `N/O` ; BUDGET `J/K`). Le fichier de
> démo présent dans `data/` a une disposition différente (CONSO service en `M`,
> consommé `T`, fléché `U` ; BUDGET service en `G`, budget en `K`). Pour rester
> robuste aux deux dispositions, les colonnes sont **localisées par leur en-tête**.
> Les lettres effectivement retenues sont remontées dans `stats.consoColumns` /
> `stats.budgetColumns`.

### Services autorisés (liste blanche stricte)

`Social Media`, `Webmarketing`, `Relations Presse`, `Audiovisuel`, `Event`,
`Marketing France`, `Marketing International`, `Marketing Entreprise`,
`Com et Marketing transverse`.

- Toute valeur hors liste est **ignorée** (comptée dans les warnings).
- Comparaison tolérante à la casse/accents + alias connus
  (`EVENTS`→`Event`, `PRESSE`→`Relations Presse`, `Réseaux sociaux`→`Social Media`…).
- Un service avec budget mais sans conso apparaît (avancement calculé sur 0
  consommé). Un service avec conso mais sans budget apparaît avec budget dédié
  `0` et un **warning** (avancement non calculable).

### Calculs

```
Reste à dépenser = Budget dédié − Consommé − Fléché
Avancement       = (Consommé + Fléché) / Budget dédié      (null si budget = 0)
```

- Calculs en valeurs brutes ; arrondi `Math.ceil` **uniquement** à l'affichage et
  au PDF. Montants en euros, format français (`12 450 €`).
- Cellule vide = `0`. Valeur non numérique = `0` + warning.
- Le **reste à dépenser n'est pas ventilé** au niveau ligne de détail (affiché
  « — »), car le budget dédié n'existe qu'au niveau service. Il est calculé aux
  niveaux **service** et **global**, coloré vert (≥ 0) / rouge (< 0).

### Pourquoi pas `outlineLevel` ?

L'ancienne logique `outlineLevel` n'est plus pertinente pour les onglets
`CONSO`/`BUDGET` (lignes à plat). La sélection repose désormais sur :
service présent dans la liste blanche + lignes de total exclues. Aucune addition
aveugle, aucun rattachement d'une ligne vide au service précédent.

---

## Performance

- **Lecture en streaming** (`ExcelJS.stream.xlsx.WorkbookReader`) : seules les
  lignes de `CONSO` et `BUDGET` sont matérialisées ; les onglets volumineux
  inutiles (EXTRACT BASWARE ~14 k lignes, BDC, …) ne sont jamais désérialisés.
  Sur le classeur de démo : ~9 s au lieu de ~41 s en lecture complète.
- **Cache mémoire backend** : le résultat agrégé est mis en cache. Avant tout
  parsing, une « version » est calculée **sans lire le contenu** (local :
  `mtime+taille` via `fs.stat` ; distant : `ETag`/`Last-Modified` via `HEAD`,
  sinon fenêtre TTL). Si la version est inchangée → réponse immédiate, **aucune
  relecture Excel**.
- **Frontend** : un seul `fetch('/api/budget')`, `useMemo`/`useCallback`,
  composants `React.memo`, et **accordéon par service** en vue Global (le détail
  n'est rendu qu'au dépliage). Les changements de filtre sont quasi instantanés.
- **Logs backend** :
  `Excel parsed in 9596ms — 2 sheets used (CONSO, BUDGET) — CONSO 309/2409 kept, BUDGET 118/1061 kept — 7 services — aggregated in 20ms — cache updated`.

---

## Logo

Placez le logo officiel dans `frontend/public/logo-audencia.svg`. Un placeholder
vectoriel sobre est fourni. Si le fichier est absent ou illisible, l'en-tête
affiche proprement le texte **« Audencia »** (fallback `onError`). Le logo figure
aussi en tête de l'export PDF.

---

## Endpoints API

`GET /api/health` → ping + source courante.

`GET /api/budget` → JSON pré-calculé :

```jsonc
{
  "source": "Local (/data/…xlsx)",
  "fileUpdatedAt": "2026-05-19T07:37:00.894Z",
  "generatedAt": "…",
  "cacheUsed": false,
  "global":  { "budgetDedie": …, "consomme": …, "fleche": …, "resteADepenser": …, "avancement": …, "isOverBudget": false },
  "services": [
    {
      "service": "Relations Presse",
      "budgetDedie": …, "consomme": …, "fleche": …,
      "resteADepenser": …, "avancement": …, "isOverBudget": false,
      "lignesDetail": [
        { "service": "Relations Presse", "partie": "…", "ensemble": "…",
          "detailLabel": "Partie — Ensemble", "consomme": …, "fleche": …,
          "sourceRows": 2, "resteADepenser": null }
      ]
    }
  ],
  "warnings": [ "…" ],
  "stats": {
    "consoRowsParsed": …, "consoRowsKept": …,
    "budgetRowsParsed": …, "budgetRowsKept": …,
    "consoColumns": { "service": "M", "partie": "N", "ensemble": "O", "consomme": "T", "fleche": "U" },
    "budgetColumns": { "service": "G", "budget": "K" },
    "sheetsUsed": ["CONSO", "BUDGET"],
    "sheetsIgnored": ["BDC", "…"],
    "servicesDetected": 7,
    "aggregationMs": 20
  }
}
```

### Cas d'erreur / robustesse

- Aucune source / fichier introuvable → `404` (`NO_SOURCE`, `FILE_NOT_FOUND`).
- Distant inaccessible → fallback local, sinon `500 REMOTE_AND_FALLBACK_FAILED`.
- Onglet `CONSO`/`BUDGET` absent → warning, traité comme vide.
- Colonne (Pôle/Partie/Ensemble/CONSOMME/FLECHE/budget) introuvable → warning.
- Service hors liste / montant non numérique / budget = 0 → warnings dédiés.
- Aucune ligne exploitable → warning, dashboard « aucune donnée ».

---

## Architecture

```
budget/
├── data/                         ← Excel de démo / fallback
├── server/
│   ├── index.js                  ← Express + cache mémoire + logs perf
│   ├── source.js                 ← Résolution source + streaming + version
│   ├── excel.js                  ← Agrégation CONSO/BUDGET (liste blanche)
│   └── package.json
├── frontend/
│   ├── index.html                ← police Sora (Google Fonts)
│   ├── vite.config.ts            ← proxy /api → :4000
│   ├── public/logo-audencia.svg  ← logo (remplaçable)
│   └── src/
│       ├── App.tsx               ← fetch unique + sélection mémoïsée
│       ├── format.ts, exportPdf.ts, styles.css, types.ts
│       └── components/ Header, Filters, KpiCards, ProgressSection,
│                       CommentSection, DetailTable
├── .env.example
└── package.json
```

---

## Mettre à jour le fichier Excel

Remplacez le fichier (ou mettez à jour la version SharePoint) puis rafraîchissez
le dashboard : le cache détecte automatiquement le changement (mtime/ETag) et
relit la source. Sinon, la réponse est servie depuis le cache.

## Build production (optionnel)

```bash
cd frontend && npm run build && npm run preview
```
