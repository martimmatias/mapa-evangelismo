const DATA_SERVICE = 'https://sig.lneg.pt/server/rest/services/geoPortal/CAOP_DGT/MapServer';
const SVG_NS = 'http://www.w3.org/2000/svg';
const DISTRICTS = window.DISTRICT_GEOMETRY;
const CENSUS = window.CENSUS_2021;
const districtLayer = document.querySelector('#district-tiles');
const insetLayer = document.querySelector('#island-insets');
const mapFrame = document.querySelector('.map-frame');
const backButton = document.querySelector('#back-button');
const censusPanel = {
  count: document.querySelector('#census-count'),
  share: document.querySelector('#census-share'),
  denominator: document.querySelector('#census-denominator'),
};
const mapTooltip = {
  root: document.querySelector('#map-tooltip'),
  name: document.querySelector('#map-tooltip-name'),
  count: document.querySelector('#map-tooltip-count'),
  share: document.querySelector('#map-tooltip-share'),
  stats: document.querySelector('#map-tooltip-stats'),
  unavailable: document.querySelector('#map-tooltip-unavailable'),
};
const selection = {
  index: document.querySelector('#selection-index'),
  kind: document.querySelector('#selection-kind'),
  name: document.querySelector('#selection-name'),
  copy: document.querySelector('#selection-copy'),
  region: document.querySelector('#selection-region'),
};
const pageIntro = document.querySelector('#page-intro');
const mapHeading = document.querySelector('#map-heading');
const mapKicker = document.querySelector('#map-kicker');
const mapHint = document.querySelector('#map-hint-text');
const svgTitle = document.querySelector('#svg-title');
const svgDescription = document.querySelector('#svg-description');
const svgRegionLabel = document.querySelector('#svg-region-label');
const mapNote = document.querySelector('#map-note');
const primaryTotal = document.querySelector('#map-total-primary');
const primaryLabel = document.querySelector('#map-primary-label');
const secondaryTotal = document.querySelector('#map-total-secondary');
const secondaryLabel = document.querySelector('#map-secondary-label');
const levelSteps = [...document.querySelectorAll('.level-step')];
const responseCache = new Map();
const numberFormat = new Intl.NumberFormat('en-GB');
const percentageFormat = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const choroplethColors = ['#f3efd9', '#dce9d5', '#b6d5bf', '#7fb696', '#2f775f'];
const mapLegend = {
  root: document.querySelector('#map-legend'),
  title: document.querySelector('#map-legend-title'),
  count: document.querySelector('#map-legend-count'),
  min: document.querySelector('#map-legend-min'),
  max: document.querySelector('#map-legend-max'),
  note: document.querySelector('#map-legend-note'),
  swatches: [...document.querySelectorAll('#map-legend-scale span')],
};

let currentView = {
  level: 'districts',
  district: null,
  municipality: null,
  municipalities: [],
  parishes: [],
};
let requestSequence = 0;

const regionNames = {
  north: 'Northern Portugal',
  northeast: 'Northern Portugal',
  centre: 'Central Portugal',
  coast: 'Lisbon region',
  alentejo: 'Alentejo',
  algarve: 'Algarve',
};

function getZone(district) {
  if (['Bragança', 'Guarda', 'Vila Real'].includes(district.name)) return 'northeast';
  if (['Braga', 'Porto', 'Viana do Castelo'].includes(district.name)) return 'north';
  if (['Lisboa', 'Setúbal'].includes(district.name)) return 'coast';
  if (district.name === 'Faro') return 'algarve';
  if (['Beja', 'Évora', 'Portalegre'].includes(district.name)) return 'alentejo';
  return 'centre';
}

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (parent) parent.appendChild(element);
  return element;
}

function getLocationCensus(code, width) {
  const key = String(code || '').padStart(width, '0');
  const row = CENSUS.locations[key];
  return row ? { total: row[0], evangelical: row[1] } : null;
}

function getDistrictCensus(district) {
  return CENSUS.districts[district.id] || null;
}

function relativeColorIndex(value, sortedValues) {
  const minimum = sortedValues[0];
  const maximum = sortedValues[sortedValues.length - 1];
  if (minimum === maximum) return Math.floor(choroplethColors.length / 2);
  if (value === minimum) return 0;
  if (value === maximum) return choroplethColors.length - 1;

  let lowerRank = 0;
  while (lowerRank < sortedValues.length && sortedValues[lowerRank] < value) lowerRank += 1;
  return Math.min(choroplethColors.length - 1, Math.floor((lowerRank / sortedValues.length) * choroplethColors.length));
}

function updateRelativeChoropleth(tiles) {
  const available = tiles.filter(({ stats }) => stats && stats.total > 0);
  const sortedShares = available
    .map(({ stats }) => stats.evangelical / stats.total)
    .sort((a, b) => a - b);
  const levels = {
    districts: 'DISTRICTS',
    municipalities: 'CONCELHOS',
    parishes: 'FREGUESIAS',
  };

  mapLegend.swatches.forEach((swatch, index) => {
    swatch.style.backgroundColor = choroplethColors[index];
  });
  tiles.forEach(({ shape, stats }) => {
    const share = stats && stats.total > 0 ? stats.evangelical / stats.total : null;
    shape.style.fill = share === null
      ? '#d7ddd8'
      : choroplethColors[relativeColorIndex(share, sortedShares)];
  });

  mapLegend.title.textContent = 'RELATIVE EVANGELICAL SHARE · ' + levels[currentView.level];
  mapLegend.count.textContent = available.length + ' of ' + tiles.length + ' areas with figures';
  mapLegend.min.textContent = sortedShares.length ? percentageFormat.format(sortedShares[0] * 100) + '%' : '—';
  mapLegend.max.textContent = sortedShares.length ? percentageFormat.format(sortedShares[sortedShares.length - 1] * 100) + '%' : '—';
  mapLegend.note.textContent = sortedShares.length
    ? 'Colors rank areas against others in this map. Hover for the exact percentage; gray means no matching 2021 figure.'
    : 'No visible area has a matching 2021 census figure.';
  mapLegend.root.setAttribute(
    'aria-label',
    'Relative evangelical share among ' + levels[currentView.level].toLowerCase() + '. Lowest: ' + mapLegend.min.textContent + '. Highest: ' + mapLegend.max.textContent + '.'
  );
}

function formatCensusShare(stats) {
  if (!stats || !stats.total) return '—';
  return percentageFormat.format((stats.evangelical / stats.total) * 100) + '%';
}

function setCensusPanel(stats) {
  censusPanel.count.textContent = stats ? numberFormat.format(stats.evangelical) : '—';
  censusPanel.share.textContent = formatCensusShare(stats);
  censusPanel.denominator.textContent = stats
    ? 'Total population aged 15+: ' + numberFormat.format(stats.total)
    : 'No separate figure is available for this boundary in the 2021 Census.';
}

function formatCensusDescription(name, stats) {
  if (!stats) return name + ': no separate figure is available for this boundary in the 2021 Census.';
  return name + ': ' + numberFormat.format(stats.evangelical) + ' Protestante/Evangélica residents, ' + formatCensusShare(stats) + ' of residents aged 15+ in the 2021 Census.';
}

function placeMapTooltip(name, stats, clientX, clientY) {
  mapTooltip.name.textContent = name;
  mapTooltip.stats.hidden = !stats;
  mapTooltip.unavailable.hidden = Boolean(stats);
  if (stats) {
    mapTooltip.count.textContent = numberFormat.format(stats.evangelical);
    mapTooltip.share.textContent = formatCensusShare(stats);
  }
  mapTooltip.root.hidden = false;
  mapTooltip.root.setAttribute('aria-hidden', 'false');
  const bounds = mapTooltip.root.getBoundingClientRect();
  const x = Math.min(clientX + 14, window.innerWidth - bounds.width - 12);
  const y = Math.min(clientY + 14, window.innerHeight - bounds.height - 12);
  mapTooltip.root.style.left = Math.max(12, x) + 'px';
  mapTooltip.root.style.top = Math.max(12, y) + 'px';
}

function hideMapTooltip() {
  mapTooltip.root.hidden = true;
  mapTooltip.root.setAttribute('aria-hidden', 'true');
}

function attachCensusTooltip(group, name, stats, detail) {
  const description = formatCensusDescription(name, stats);
  group.setAttribute('aria-label', description + (detail ? ' ' + detail + '.' : ''));
  group.addEventListener('pointerenter', (event) => placeMapTooltip(name, stats, event.clientX, event.clientY));
  group.addEventListener('pointermove', (event) => {
    if (!mapTooltip.root.hidden) placeMapTooltip(name, stats, event.clientX, event.clientY);
  });
  group.addEventListener('pointerleave', hideMapTooltip);
  group.addEventListener('focus', () => {
    const bounds = group.getBoundingClientRect();
    placeMapTooltip(name, stats, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  });
  group.addEventListener('blur', hideMapTooltip);
}

function showPortugalSummary() {
  selection.index.textContent = 'PT';
  selection.kind.textContent = 'NATIONAL TOTAL';
  selection.name.textContent = 'Portugal';
  selection.name.classList.remove('is-empty');
  selection.copy.textContent = 'The overall count for Portugal. Hover over a district to see its figures.';
  selection.region.textContent = '2021 Census · residents aged 15+';
  setCensusPanel(CENSUS.portugal);
}

function createDistrictTile(district, index) {
  const group = svgElement('g', {}, districtLayer);
  group.classList.add('district-tile', 'district-tile--' + getZone(district));
  group.setAttribute('role', 'button');
  group.setAttribute('tabindex', '0');
  group.setAttribute('aria-pressed', 'false');
  group.dataset.placeIndex = String(index + 1).padStart(2, '0');

  const shape = svgElement('path', { class: 'district-shape', d: district.d, 'fill-rule': 'evenodd' }, group);
  const stats = getDistrictCensus(district);
  attachCensusTooltip(
    group,
    district.name + ' district',
    stats,
    district.municipalities + ' concelhos · ' + district.parishes + ' freguesias'
  );

  const lines = district.name === 'Viana do Castelo'
    ? ['Viana do', 'Castelo']
    : district.name === 'Castelo Branco'
      ? ['Castelo', 'Branco']
      : [district.name];
  const label = svgElement('text', {
    class: 'district-label' + (lines.length > 1 ? ' district-label--small' : ''),
    x: district.x,
    y: district.y - (lines.length > 1 ? 3 : 0),
  }, group);
  lines.forEach((line, indexInLabel) => {
    const tspan = svgElement('tspan', { x: district.x }, label);
    if (indexInLabel > 0) tspan.setAttribute('dy', '8');
    tspan.textContent = line;
  });

  const onSelect = () => openDistrict(district);
  group.addEventListener('click', onSelect);
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  });
  return { shape, stats };
}

function addIslandInsets() {
  const islands = [
    {
      x: 505, y: 88, width: 275, height: 132, title: 'AÇORES',
      shapes: [
        'M526 154l8 -5 9 2 5 5 -4 5 -9 1 -8 -3z',
        'M568 142l7 -4 8 3 2 5 -6 3 -8 -2z',
        'M599 153l10 -5 11 2 4 5 -8 5 -11 -1z',
        'M636 137l8 -3 7 4 -2 5 -10 1 -5 -3z',
        'M663 148l9 -4 10 2 3 5 -7 5 -11 -2z',
        'M703 136l12 -4 10 3 3 6 -7 5 -13 -2 -6 -4z',
        'M741 150l8 -3 8 4 -2 5 -9 2 -6 -4z',
        'M614 183l8 -3 8 3 -2 5 -8 2 -7 -3z',
        'M686 177l10 -4 12 3 3 5 -8 4 -12 -2 -6 -3z',
      ],
    },
    {
      x: 505, y: 239, width: 275, height: 132, title: 'MADEIRA',
      shapes: [
        'M597 303l10 -7 15 -2 15 3 9 5 -5 5 -17 3 -17 -1 -10 -3z',
        'M679 295l11 -3 12 2 6 5 -6 4 -14 0 -10 -3z',
        'M633 328l4 -2 4 2 -2 4 -4 0z',
        'M647 334l4 -2 4 2 -2 4 -4 0z',
      ],
    },
  ];
  islands.forEach((inset) => {
    svgElement('rect', { class: 'island-inset-frame', x: inset.x, y: inset.y, width: inset.width, height: inset.height, rx: 3 }, insetLayer);
    svgElement('text', { class: 'island-inset-label', x: inset.x + 12, y: inset.y + 17 }, insetLayer).textContent = inset.title;
    inset.shapes.forEach((d) => svgElement('path', { class: 'island-silhouette', d }, insetLayer));
    svgElement('text', { class: 'island-caption', x: inset.x + 12, y: inset.y + inset.height - 10 }, insetLayer).textContent = 'ARCHIPELAGO · SEPARATE INSET';
  });
}

function updateMetrics(primary, primaryText, secondary, secondaryText) {
  primaryTotal.textContent = primary;
  primaryLabel.textContent = primaryText;
  secondaryTotal.textContent = secondary;
  secondaryLabel.textContent = secondaryText;
}

function updateNavigation(level) {
  const activeIndex = level === 'districts' ? 0 : level === 'municipalities' ? 1 : 2;
  levelSteps.forEach((step, index) => {
    step.classList.toggle('is-current', index === activeIndex);
    step.classList.toggle('is-upcoming', index > activeIndex);
    if (index === activeIndex) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
  backButton.hidden = level === 'districts';
  backButton.textContent = level === 'parishes' ? '← Back to concelhos' : '← Back to districts';
}

function showDistrictSummary(district) {
  const index = DISTRICTS.findIndex((item) => item.id === district.id);
  const municipalityCount = currentView.municipalities.length;
  const parishCount = currentView.municipalities.reduce((sum, feature) => sum + Number(feature.properties.N_Freguesi || 0), 0);
  selection.index.textContent = String(index + 1).padStart(2, '0');
  selection.kind.textContent = 'DISTRICT MAP';
  selection.name.textContent = district.name;
  selection.name.classList.remove('is-empty');
  selection.copy.textContent = district.name + ' has ' + municipalityCount + ' concelhos and ' + parishCount + ' freguesias. Hover over a concelho to inspect its census figures.';
  selection.region.textContent = regionNames[getZone(district)];
  setCensusPanel(getDistrictCensus(district));
}

function showMunicipalitySummary(municipality, district) {
  selection.index.textContent = String(municipality.order + 1).padStart(2, '0');
  selection.kind.textContent = 'CONCELHO MAP';
  selection.name.textContent = municipality.name;
  selection.name.classList.remove('is-empty');
  selection.copy.textContent = municipality.parishCount + ' freguesias. Hover over a freguesia for its figures, or select one to keep its statistics here.';
  selection.region.textContent = district.name + ' district';
  setCensusPanel(getLocationCensus(municipality.id, 4));
}

function showParishSummary(parish, municipality, district) {
  selection.index.textContent = parish.code || '—';
  selection.kind.textContent = 'FREGUESIA SELECTED';
  selection.name.textContent = parish.name;
  selection.name.classList.remove('is-empty');
  selection.copy.textContent = 'Official DICOFRE code: ' + parish.code + '.';
  selection.region.textContent = municipality.name + ' · ' + district.name;
  setCensusPanel(getLocationCensus(parish.code, 6));
}

function showLoadError(parentName, error) {
  selection.index.textContent = '!';
  selection.kind.textContent = 'BOUNDARIES UNAVAILABLE';
  selection.name.textContent = parentName;
  selection.name.classList.remove('is-empty');
  selection.copy.textContent = 'The CAOP boundary service could not be reached. Check the connection and go back to retry. ' + error.message;
  selection.region.textContent = 'DGT · CAOP';
}

function updateViewChrome(level) {
  updateNavigation(level);
  mapFrame.setAttribute(
    'aria-label',
    level === 'districts'
      ? 'Scrollable map of Portugal by district'
      : level === 'municipalities'
        ? 'Scrollable concelho map of ' + currentView.district.name
        : 'Scrollable freguesia map of ' + currentView.municipality.name
  );
  if (level === 'districts') {
    pageIntro.textContent = 'Each mainland district keeps its real position and proportions. Tile color ranks its 2021 Protestant/Evangelical share against the other districts; hover for the exact figures and select one to explore concelhos.';
    mapKicker.textContent = 'NATIONAL MAP · 01';
    mapHeading.textContent = 'Select a district';
    mapHint.textContent = 'Color ranks share · hover for figures · select a district · scroll sideways on small screens';
    svgTitle.textContent = 'Portugal by district';
    svgDescription.textContent = 'The eighteen mainland districts are individual CAOP boundary silhouettes drawn in geographic position and at a shared scale. Select a district shape. The Azores and Madeira are shown in separate illustrative insets.';
    svgRegionLabel.textContent = 'CONTINENTAL PORTUGAL';
    mapNote.textContent = 'MAINLAND DISTRICTS SHARE ONE SCALE · ISLAND INSETS NOT TO SCALE';
    updateMetrics('18', 'Mainland\ndistricts', '2', 'Autonomous\nregions');
    showPortugalSummary();
    return;
  }

  if (level === 'municipalities') {
    const district = currentView.district;
    pageIntro.textContent = 'This district map keeps each concelho in its real position and proportions. Tile color ranks each concelho against the others in this district; hover for exact figures and select one to see its freguesias.';
    mapKicker.textContent = 'DISTRICT MAP · 02';
    mapHeading.textContent = 'Concelhos in ' + district.name;
    mapHint.textContent = 'Color ranks share among concelhos · hover for figures · select a concelho';
    svgTitle.textContent = district.name + ' by concelho';
    svgDescription.textContent = 'The concelhos of ' + district.name + ' are drawn as individual official boundary shapes. Select one to open its freguesias.';
    svgRegionLabel.textContent = district.name.toUpperCase() + ' · CONCELHOS';
    mapNote.textContent = 'CONCELHOS IN ' + district.name.toUpperCase() + ' · SHARED SCALE';
    const totalParishes = currentView.municipalities.reduce((sum, feature) => sum + Number(feature.properties.N_Freguesi || 0), 0);
    updateMetrics(String(currentView.municipalities.length), 'Concelhos', String(totalParishes), 'Freguesias');
    setCensusPanel(getDistrictCensus(district));
    return;
  }

  const district = currentView.district;
  const municipality = currentView.municipality;
  pageIntro.textContent = 'Explore the freguesias within ' + municipality.name + '. Tile color ranks their shares relative to each other; hover for exact figures and select a freguesia to show its statistics in the panel.';
  mapKicker.textContent = 'CONCELHO MAP · 03';
  mapHeading.textContent = 'Freguesias in ' + municipality.name;
  mapHint.textContent = 'Color ranks share among freguesias · hover for figures · select a freguesia';
  svgTitle.textContent = municipality.name + ' by freguesia';
  svgDescription.textContent = 'The freguesias within ' + municipality.name + ' are drawn as individual official boundary shapes. Select a freguesia to see its DICOFRE code.';
  svgRegionLabel.textContent = municipality.name.toUpperCase() + ' · FREGUESIAS';
  mapNote.textContent = 'FREGUESIAS IN ' + municipality.name.toUpperCase() + ' · SHARED SCALE';
  updateMetrics(String(currentView.parishes.length), 'Freguesias', '1', 'Concelho\nselected');
  setCensusPanel(getLocationCensus(municipality.id, 4));
}

function queryFeatures(layer, where, offset) {
  const cacheKey = layer + '|' + where + '|' + offset;
  if (responseCache.has(cacheKey)) return responseCache.get(cacheKey);
  const fields = layer === 2
    ? 'DICO,Concelho,Distrito,N_Freguesi'
    : 'DICOFRE,Freguesia,Municipio,Distrito,Des_Simpli';
  const params = new URLSearchParams({
    where,
    outFields: fields,
    returnGeometry: 'true',
    outSR: '3763',
    maxAllowableOffset: String(offset),
    geometryPrecision: '0',
    f: 'geojson',
  });
  const request = fetch(DATA_SERVICE + '/' + layer + '/query?' + params.toString(), {
    headers: { Accept: 'application/geo+json, application/json' },
  }).then(async (response) => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'ArcGIS query failed');
    if (!Array.isArray(data.features)) throw new Error('The map service returned no feature collection.');
    return data.features;
  }).catch((error) => {
    responseCache.delete(cacheKey);
    throw error;
  });
  responseCache.set(cacheKey, request);
  return request;
}

function getPolygonParts(geometry) {
  if (!geometry || !geometry.coordinates) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function getFeatureBounds(features) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  features.forEach((feature) => {
    getPolygonParts(feature.geometry).forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
      });
    });
  });
  if (!Number.isFinite(bounds.minX)) throw new Error('The selected area has no drawable boundary.');
  return bounds;
}

function makeProjector(bounds) {
  const area = { x: 54, y: 42, width: 724, height: 672 };
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(area.width / spanX, area.height / spanY);
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = area.x + (area.width - drawnWidth) / 2;
  const offsetY = area.y + (area.height - drawnHeight) / 2;
  return ([x, y]) => [
    offsetX + (x - bounds.minX) * scale,
    offsetY + (bounds.maxY - y) * scale,
  ];
}

function formatSvgNumber(value) {
  return String(Math.round(value * 100) / 100);
}

function geometryPath(geometry, project) {
  const commands = [];
  getPolygonParts(geometry).forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach((coordinate, index) => {
        const point = project(coordinate);
        commands.push((index === 0 ? 'M' : 'L') + formatSvgNumber(point[0]) + ',' + formatSvgNumber(point[1]));
      });
      commands.push('Z');
    });
  });
  return commands.join('');
}

function ringArea(ring) {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(sum / 2);
}

function ringCentroid(ring) {
  let areaFactor = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    areaFactor += cross;
    xSum += (x1 + x2) * cross;
    ySum += (y1 + y2) * cross;
  }
  if (!areaFactor) return ring[0] || [0, 0];
  return [xSum / (3 * areaFactor), ySum / (3 * areaFactor)];
}

function isInsideRing(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function scanlinePoint(ring) {
  const ys = ring.map((point) => point[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best = ring[0] || [0, 0];
  let bestWidth = 0;
  for (let step = 1; step < 20; step += 1) {
    const y = minY + ((maxY - minY) * step) / 20;
    const intersections = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      if ((y1 > y) !== (y2 > y)) intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const width = intersections[i + 1] - intersections[i];
      if (width > bestWidth) {
        bestWidth = width;
        best = [(intersections[i] + intersections[i + 1]) / 2, y];
      }
    }
  }
  return best;
}

function featureLabelPoint(geometry) {
  const parts = getPolygonParts(geometry);
  let largestRing = null;
  let largestArea = -1;
  parts.forEach((polygon) => {
    const ring = polygon[0];
    const area = ring ? ringArea(ring) : 0;
    if (ring && area > largestArea) {
      largestArea = area;
      largestRing = ring;
    }
  });
  if (!largestRing) return [0, 0];
  const centroid = ringCentroid(largestRing);
  return isInsideRing(centroid, largestRing) ? centroid : scanlinePoint(largestRing);
}

function featureDetails(feature, level, order) {
  const properties = feature.properties || {};
  if (level === 'municipalities') {
    return {
      id: properties.DICO || String(order),
      name: properties.Concelho || 'Unnamed concelho',
      label: properties.Concelho || 'Unnamed concelho',
      parishCount: Number(properties.N_Freguesi || 0),
      order,
    };
  }
  return {
    id: properties.DICOFRE || String(order),
    code: properties.DICOFRE || '',
    name: properties.Freguesia || 'Unnamed freguesia',
    label: properties.Des_Simpli || properties.Freguesia || 'Unnamed freguesia',
    order,
  };
}

function shortLabel(text, maximum) {
  const normalized = text.replace(/^Uni[aã]o das freguesias (de|do|da) /i, '');
  if (normalized.length <= maximum) return normalized;
  return normalized.slice(0, maximum - 1).trimEnd() + '…';
}

function renderChildMap(features, level) {
  if (!features.length) throw new Error('No boundaries were returned for this area.');
  districtLayer.replaceChildren();
  insetLayer.replaceChildren();
  const bounds = getFeatureBounds(features);
  const project = makeProjector(bounds);
  const placeClass = level === 'municipalities' ? 'municipality' : 'parish';
  const tiles = [];
  features.forEach((feature, index) => {
    if (!feature.geometry) return;
    const details = featureDetails(feature, level, index);
    const group = svgElement('g', {}, districtLayer);
    group.classList.add('map-area', 'map-area--' + placeClass, 'map-area--tone-' + (index % 5));
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-pressed', 'false');
    group.dataset.placeId = details.id;

    const shape = svgElement('path', { class: 'map-area-shape', d: geometryPath(feature.geometry, project), 'fill-rule': 'evenodd' }, group);
    const stats = level === 'municipalities'
      ? getLocationCensus(details.id, 4)
      : getLocationCensus(details.code, 6);
    tiles.push({ shape, stats });
    attachCensusTooltip(
      group,
      details.name,
      stats,
      level === 'municipalities' ? details.parishCount + ' freguesias' : 'DICOFRE ' + details.code
    );

    const labelPoint = project(featureLabelPoint(feature.geometry));
    const labelText = shortLabel(details.label, level === 'municipalities' ? 19 : 18);
    const label = svgElement('text', {
      class: 'map-area-label' + (level === 'parishes' ? ' map-area-label--parish' : ''),
      x: formatSvgNumber(labelPoint[0]),
      y: formatSvgNumber(labelPoint[1]),
    }, group);
    label.textContent = labelText;

    const onSelect = () => {
      if (level === 'municipalities') openMunicipality(feature, details);
      else selectParish(group, details);
    };
    group.addEventListener('click', onSelect);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    });
  });
  updateRelativeChoropleth(tiles);
}

async function openDistrict(district) {
  const sequence = ++requestSequence;
  currentView = { level: 'municipalities', district, municipality: null, municipalities: [], parishes: [] };
  updateViewChrome('municipalities');
  districtLayer.replaceChildren();
  insetLayer.replaceChildren();
  selection.copy.textContent = 'Loading concelho boundaries from CAOP…';
  selection.name.textContent = district.name;
  selection.kind.textContent = 'LOADING CONCELHOS';
  selection.index.textContent = '…';
  mapHint.textContent = 'Loading official concelho boundaries…';

  try {
    const features = await queryFeatures(2, "Distrito='" + district.name.replace(/'/g, "''") + "'", 120);
    if (sequence !== requestSequence) return;
    currentView.municipalities = features;
    renderChildMap(features, 'municipalities');
    updateViewChrome('municipalities');
    showDistrictSummary(district);
    mapFrame.focus();
  } catch (error) {
    if (sequence !== requestSequence) return;
    showLoadError(district.name, error);
    mapHint.textContent = 'Boundary service unavailable · use Back to retry';
  }
}

async function openMunicipality(feature, details) {
  const sequence = ++requestSequence;
  const district = currentView.district;
  const municipalities = currentView.municipalities;
  currentView = { level: 'parishes', district, municipality: details, municipalities, parishes: [] };
  updateViewChrome('parishes');
  districtLayer.replaceChildren();
  insetLayer.replaceChildren();
  selection.copy.textContent = 'Loading freguesia boundaries from CAOP…';
  selection.name.textContent = details.name;
  selection.kind.textContent = 'LOADING FREGUESIAS';
  selection.index.textContent = '…';
  mapHint.textContent = 'Loading official freguesia boundaries…';

  try {
    const code = String(details.id).padStart(4, '0');
    const where = "DICOFRE LIKE '" + code.replace(/'/g, "''") + "%'";
    const features = await queryFeatures(3, where, 8);
    if (sequence !== requestSequence) return;
    currentView.parishes = features;
    renderChildMap(features, 'parishes');
    updateViewChrome('parishes');
    showMunicipalitySummary(details, district);
    mapFrame.focus();
  } catch (error) {
    if (sequence !== requestSequence) return;
    showLoadError(details.name, error);
    mapHint.textContent = 'Boundary service unavailable · use Back to retry';
  }
}

function selectParish(group, parish) {
  document.querySelectorAll('.map-area--parish.is-selected').forEach((selected) => {
    selected.classList.remove('is-selected');
    selected.setAttribute('aria-pressed', 'false');
  });
  group.classList.add('is-selected');
  group.setAttribute('aria-pressed', 'true');
  showParishSummary(parish, currentView.municipality, currentView.district);
}

function backOneLevel() {
  requestSequence += 1;
  if (currentView.level === 'parishes') {
    currentView.level = 'municipalities';
    currentView.municipality = null;
    currentView.parishes = [];
    updateViewChrome('municipalities');
    renderChildMap(currentView.municipalities, 'municipalities');
    showDistrictSummary(currentView.district);
    mapFrame.focus();
    return;
  }
  currentView = { level: 'districts', district: null, municipality: null, municipalities: [], parishes: [] };
  renderNationalMap();
  updateViewChrome('districts');
  mapFrame.focus();
}

function renderNationalMap() {
  districtLayer.replaceChildren();
  insetLayer.replaceChildren();
  const tiles = DISTRICTS.map(createDistrictTile);
  updateRelativeChoropleth(tiles);
  addIslandInsets();
}

backButton.addEventListener('click', backOneLevel);
renderNationalMap();
updateViewChrome('districts');
