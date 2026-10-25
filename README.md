# Portugal Atlas

A buildless static site for exploring Portugal through three map levels: districts, concelhos, and freguesias. Select a district to open its concelho map, then select a concelho to open its freguesia map. Back buttons return to the previous level.

The national map embeds the 18 mainland district shapes from CAOP 2025. The two deeper levels load their official boundaries on demand from DGT’s public CAOP ArcGIS service. Census figures are bundled locally, so the map does not make a separate statistics request. The page needs an internet connection for the concelho and freguesia boundaries, but no backend or build step.

The census layer uses INE’s [Censos 2021 religion table](https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_indicadores&indOcorrCod=0011644&contexto=bd&selTab=tab2), “População residente com 15 e mais anos de idade (N.º) por Local de residência à data dos Censos [2021] (NUTS - 2013) e Religião.” The displayed count is the combined “Protestante/Evangélica” category. The percentage is that count divided by the table’s “Total” population aged 15 and over, including people who did not answer the religion question. District values are summed from their concelhos using the official DICO district prefix. `census-data.js` contains the extracted count and denominator for Portugal, all 18 mainland districts, 308 concelhos and 3,084 Censos 2021 freguesias. If a displayed parish boundary has no matching 2021 code, the app marks it as unavailable rather than splitting an older combined-unit total.

Tile colors rank each visible district, concelho, or freguesia by its Protestant/Evangelical share relative to the other areas in that map. The legend updates when moving between map levels, shows the low and high percentages, and uses gray for a boundary with no matching 2021 figure. Hover shows the exact count and percentage.

## Run locally

Open `index.html` directly, or serve this folder with any static HTTP server. The page uses HTML, CSS, SVG, and browser JavaScript; there is no install or build step.

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys this buildless static site when you push to `main` or `master`, and can also be started manually from the Actions tab. In the repository’s **Settings → Pages**, choose **GitHub Actions** as the build and deployment source. The site files are uploaded directly; there is no build step.

The same five site files (`index.html`, `styles.css`, `app.js`, `district-geometry.js`, and `census-data.js`) can also be uploaded to the published root of another static host.

Boundary data and administrative names follow the [Official Administrative Charter of Portugal (CAOP)](https://www.dgterritorio.gov.pt/atividades/cartografia/cartografia-tematica/caop?language=pt), published by the Directorate-General for Territory (DGT). Concelho and freguesia boundaries are requested from the [public CAOP map service](https://sig.lneg.pt/server/rest/services/geoPortal/CAOP_DGT/MapServer).
