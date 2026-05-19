# Audencia – Suivi budgétaire marketing

Application web locale qui lit automatiquement un classeur Excel placé dans
`/data`, agrège les données budgétaires par service marketing et les affiche
dans un dashboard sobre, institutionnel, exportable en PDF.

- **Frontend** : React + Vite + TypeScript
- **Backend**  : Node.js + Express + ExcelJS
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

## 3. Placer le fichier Excel

Déposez le classeur dans :

```
/data/Essai maquette 2026 AGO_vivi.xlsx
```

> Le serveur prend en priorité ce nom de fichier. À défaut, il prend le premier
> `.xlsx` présent dans le dossier `/data`.

## 4. Lancer l'application

```bash
npm run dev
```

Cette commande lance en parallèle :

- le **backend** sur `http://localhost:4000` (endpoint `/api/budget`)
- le **frontend** sur `http://localhost:5173`

Ouvrez ensuite **http://localhost:5173** dans votre navigateur.

> Le frontend appelle `/api/budget` via le proxy Vite, vous n'avez rien à
> configurer.

### Lancer chaque service séparément

```bash
npm run dev:server     # backend seul
npm run dev:frontend   # frontend seul
```

## 5. Utilisation

1. Le dashboard charge automatiquement les données du fichier Excel.
2. Cliquez sur les filtres de service ou sur **Global** pour changer de vue.
3. Saisissez un commentaire libre (un par vue) – il est conservé pendant la
   session du navigateur.
4. Cliquez sur **Exporter en PDF** : un PDF A4 contenant le titre, la date, les
   KPI, la barre de progression et le commentaire est téléchargé.

---

## Fonctionnement de l'extraction Excel

### Règles appliquées

Pour chaque onglet du classeur :

- **Colonne A** : nom du service (doit correspondre exactement, après
  normalisation casse/accents/espaces, à l'un des services autorisés).
- **Colonne K** → Budget initial (`Forecast (Calculé)`).
- **Colonne L** → Budget consommé (`CONSOMME`).
- **Colonne M** → Budget fléché (`FLECHE`).
- Les cellules vides comptent comme `0`.
- Les lignes contenant un libellé "Total", "Total général", "Grand Total" en
  colonne A ou dans une cellule significative sont exclues.
- Les valeurs sont sommées par service ; si un service apparaît dans plusieurs
  onglets, ses montants s'additionnent (règle 11).
- Les calculs sont effectués en valeurs brutes. L'arrondi à l'entier supérieur
  (`Math.ceil`) est uniquement appliqué à l'affichage et au PDF.

### Services autorisés

`Presse`, `Event`, `Webmarketing`, `Com Interne`, `Réseaux sociaux`,
`Audiovisuel`.

> La comparaison est tolérante à la casse et aux accents : "EVENT", "Event",
> "event" sont équivalents et normalisés vers `Event`.

### Stratégie outlineLevel et secours

Le cahier des charges définit comme critère prioritaire la propriété
`outlineLevel === 1` d'ExcelJS.

**Sur le classeur fourni**, ExcelJS lit correctement `outlineLevel`, mais
**aucune ligne exploitable** n'expose `outlineLevel === 1` : la quasi-totalité
des lignes du fichier ont `outlineLevel === 0` (la seule ligne `outlineLevel=1`
trouvée se situe sur l'onglet `GLOBAL`, qui n'expose pas la grille
service/K/L/M attendue).

La **stratégie de secours documentée** est donc appliquée automatiquement, et
un avertissement est exposé dans l'API (`warnings[]`) et dans l'interface :

> Une ligne est conservée si, et seulement si :
> 1. la colonne A contient **exactement** un nom de service autorisé (match
>    après normalisation accent/casse) ;
> 2. au moins une des colonnes K/L/M contient un nombre ;
> 3. ni A, ni K, ni L, ni M ne contiennent un libellé "Total / Total général /
>    Grand Total" ;
> 4. `outlineLevel` est `0` ou `1` (les sous-lignes `outlineLevel ≥ 2` sont
>    systématiquement rejetées).

Cette stratégie évite toute addition aveugle de lignes : seules les lignes
"feuilles" des tableaux croisés (où le service apparaît tel quel en colonne A)
sont conservées. Les onglets `BUDGET`, `CONSO`, `BDC`, `PROSPECTION FRANCE`,
etc. comportent des chaînes concaténées en colonne A (résultat de formules) et
ne sont donc pas additionnés.

### Hypothèses techniques

| Hypothèse | Détail |
|-----------|--------|
| Librairie de lecture Excel | ExcelJS – lit `outlineLevel`, mais l'information n'est pas exploitable sur ce classeur (cf. ci-dessus). |
| Normalisation des services | NFD + suppression des diacritiques + minuscule + trim. |
| Devise | Euros uniquement ; format français `12 451 €`. |
| Arrondi | `Math.ceil` à l'affichage et au PDF ; les calculs internes restent en `Number` JS. |
| Reste à dépenser négatif | Affiché comme **dépassement** avec mise en avant visuelle. |
| Budget initial = 0 | Avancement non calculable, affiché explicitement (pas de division par zéro). |
| Persistance des commentaires | `sessionStorage` (1 commentaire par vue Global/service). |

---

## Endpoints API

`GET /api/health` → ping serveur.

`GET /api/budget` → renvoie :

```jsonc
{
  "file": "Essai maquette 2026 AGO_vivi.xlsx",
  "generatedAt": "2026-05-19T07:53:26.221Z",
  "global":   { "name": "Global", "initial": …, "consomme": …, "fleche": …, "reste": …, "engagementRatio": …, "isOverBudget": false, "rowsCount": … },
  "services": [
    { "name": "Presse",         "initial": …, "consomme": …, "fleche": …, "reste": …, "engagementRatio": …, "isOverBudget": false, "rowsCount": … },
    { "name": "Event",          … },
    { "name": "Webmarketing",   … },
    { "name": "Com Interne",    … },
    { "name": "Réseaux sociaux", … },
    { "name": "Audiovisuel",    … }
  ],
  "warnings": [ "…" ],
  "stats": {
    "rowsKept": 48,
    "rowsIgnored": 24359,
    "outlineLevel1Total": 1,
    "outlineLevel1Kept": 0,
    "outlineLevelFallback": true,
    "sheets": [ { "name": "PRESSE", "kept": 12, "ignored": 4, "empty": false }, … ]
  }
}
```

### Cas d'erreur traités

- Fichier Excel absent → `404 FILE_NOT_FOUND`.
- Erreur de lecture / parsing → `500 EXTRACTION_ERROR` avec message.
- Onglet vide → ignoré silencieusement, comptabilisé dans `stats.sheets`.
- Colonne manquante → la cellule vide est traitée comme `0`.
- Service non reconnu → ligne ignorée, comptée dans `rowsIgnored`.
- Aucun montant exploitable → ligne ignorée.
- Budget initial nul → frontend affiche "non calculable", pas de division.

---

## Architecture

```
budget/
├── data/                                          ← Excel attendu ici
│   └── Essai maquette 2026 AGO_vivi.xlsx
├── server/                                        ← Backend Express
│   ├── index.js                                   ← Serveur + endpoints
│   ├── excel.js                                   ← Extraction + agrégation
│   └── package.json
├── frontend/                                      ← Frontend Vite/React/TS
│   ├── index.html
│   ├── vite.config.ts                             ← Proxy /api → :4000
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── format.ts                              ← Formatage EUR / % / date FR
│       ├── exportPdf.ts                           ← Capture DOM → PDF A4
│       ├── styles.css                             ← Charte beige/bleu nuit
│       └── components/
│           ├── Header.tsx
│           ├── Filters.tsx
│           ├── KpiCards.tsx
│           ├── ProgressSection.tsx
│           └── CommentSection.tsx
└── package.json                                   ← Scripts dev racine
```

---

## Mettre à jour le fichier Excel

1. Remplacez `/data/Essai maquette 2026 AGO_vivi.xlsx` (ou tout autre `.xlsx`
   dans `/data`).
2. Rafraîchissez la page du dashboard.

Aucune autre étape : la lecture est faite à chaque appel `/api/budget`.

---

## Build production (optionnel)

```bash
cd frontend
npm run build
# puis npm run preview pour tester le bundle
```

Le backend peut servir le bundle généré : actuellement non câblé pour rester
fidèle au mode "dev local" demandé.
