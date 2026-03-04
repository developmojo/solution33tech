const componentTemplates = [
  {
    id: 'smelter',
    name: 'Smelter',
    baseProperties: { powerMW: 4, footprint: 9, throughputPerMin: 30 },
    resources: ['Iron Ingot', 'Copper Ingot', 'Caterium Ingot', 'Pure Iron Ingot (Alt Recipe)']
  },
  {
    id: 'constructor',
    name: 'Constructor',
    baseProperties: { powerMW: 4, footprint: 8, throughputPerMin: 15 },
    resources: ['Iron Plate', 'Iron Rod', 'Wire', 'Iron Pipe', 'Steel Screw (Alt Recipe)']
  },
  {
    id: 'refinery',
    name: 'Refinery',
    baseProperties: { powerMW: 30, footprint: 20, throughputPerMin: 30 },
    resources: ['Plastic', 'Rubber', 'Fuel', 'Residual Plastic (Alt Recipe)', 'Residual Rubber (Alt Recipe)']
  },
  {
    id: 'assembler',
    name: 'Assembler',
    baseProperties: { powerMW: 15, footprint: 16, throughputPerMin: 7.5 },
    resources: ['Reinforced Plate', 'Rotor', 'Modular Frame', 'Bolted Iron Plate (Alt Recipe)', 'Steel Rotor (Alt Recipe)']
  }
];

const STORAGE_KEY = 'factory-item-tracker-state-v2';
const STORAGE_KEY_CORE = 'factory-item-tracker-state-core-v2';
const RECIPE_TYPES = ['all', 'standard', 'alt'];
const NODE_WIDTH = 180;
const NODE_HEIGHT = 84;
const DEFAULT_GRID_HEIGHT = 360;
const MIN_GRID_ZOOM = 0.5;
const MAX_GRID_ZOOM = 2.5;
const GRID_ZOOM_STEP = 0.1;

const placedComponents = [];
const groups = new Set();
const factories = new Map();
const groupFactoryMap = new Map();
const resourceConnections = [];
const gridView = {
  zoom: 1,
  mapImage: '',
  mapAspectRatio: null,
  mapAspectResolving: false
};

const catalogEl = document.getElementById('itemCatalog');
const legendEl = document.getElementById('resourceLegend');
const dropZoneEl = document.getElementById('dropZone');
const envTotalsEl = document.getElementById('environmentTotals');
const groupTotalsEl = document.getElementById('groupTotals');
const factoryTotalsEl = document.getElementById('factoryTotals');

const groupNameEl = document.getElementById('groupName');
const createGroupBtn = document.getElementById('createGroupBtn');
const assignGroupBtn = document.getElementById('assignGroupBtn');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonInput = document.getElementById('importJsonInput');
const resetAllBtn = document.getElementById('resetAllBtn');

const factoryNameEl = document.getElementById('factoryName');
const createFactoryBtn = document.getElementById('createFactoryBtn');
const groupForFactorySelectEl = document.getElementById('groupForFactorySelect');
const factoryAssignSelectEl = document.getElementById('factoryAssignSelect');
const assignGroupToFactoryBtn = document.getElementById('assignGroupToFactoryBtn');

const connSourceFactoryEl = document.getElementById('connSourceFactory');
const connSourceGroupEl = document.getElementById('connSourceGroup');
const connSourceResourceEl = document.getElementById('connSourceResource');
const connTargetFactoryEl = document.getElementById('connTargetFactory');
const connTargetGroupEl = document.getElementById('connTargetGroup');
const connTargetResourceEl = document.getElementById('connTargetResource');
const addConnectionBtn = document.getElementById('addConnectionBtn');
const connectionListEl = document.getElementById('connectionList');

const factoryGridEl = document.getElementById('factoryGrid');
const factoryMapLayerEl = document.getElementById('factoryMapLayer');
const factoryGridPatternEl = document.getElementById('factoryGridPattern');
const factoryConnectionsLayerEl = document.getElementById('factoryConnectionsLayer');
const factoryNodesLayerEl = document.getElementById('factoryNodesLayer');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const fitMapBtn = document.getElementById('fitMapBtn');
const zoomLevelLabel = document.getElementById('zoomLevelLabel');
const loadMapImageBtn = document.getElementById('loadMapImageBtn');
const clearMapImageBtn = document.getElementById('clearMapImageBtn');
const mapImageInput = document.getElementById('mapImageInput');
const fallbackStorageBadgeEl = document.getElementById('fallbackStorageBadge');

init();

function init() {
  renderCatalog();
  renderLegend();
  setupDropZone();
  setupToolbar();
  setupFactoryControls();
  setupConnectionControls();
  setupFactoryGridControls();
  hydrateStateFromStorage();
  applyFactoryGridView();
  renderPlaced();
  recalcAndRenderTotals();
  refreshFactoryManagementUI();

  const onResize = throttle(() => {
    applyFactoryGridView();
    renderFactoryGrid();
  }, 80);

  window.addEventListener('resize', onResize);
}

function setupFactoryGridControls() {
  zoomOutBtn.addEventListener('click', () => {
    setGridZoom(gridView.zoom - GRID_ZOOM_STEP);
  });

  zoomInBtn.addEventListener('click', () => {
    setGridZoom(gridView.zoom + GRID_ZOOM_STEP);
  });

  zoomResetBtn.addEventListener('click', () => {
    setGridZoom(1);
  });

  fitMapBtn.addEventListener('click', () => {
    fitMapToGrid();
  });

  loadMapImageBtn.addEventListener('click', () => {
    mapImageInput.click();
  });

  clearMapImageBtn.addEventListener('click', () => {
    gridView.mapImage = '';
    gridView.mapAspectRatio = null;
    applyFactoryGridView();
    renderFactoryGrid();
    saveStateToStorage();
  });

  mapImageInput.addEventListener('change', async () => {
    const [file] = mapImageInput.files || [];
    if (!file) {
      return;
    }

    try {
      gridView.mapImage = await readFileAsDataURL(file);
      gridView.mapAspectRatio = await getImageAspectRatio(gridView.mapImage);
      applyFactoryGridView();
      renderFactoryGrid();
      saveStateToStorage();
    } catch (error) {
      console.warn('Unable to load map image.', error);
      alert('Unable to load map image file.');
    } finally {
      mapImageInput.value = '';
    }
  });

  factoryGridEl.addEventListener('wheel', (event) => {
    event.preventDefault();

    const delta = event.deltaY < 0 ? GRID_ZOOM_STEP : -GRID_ZOOM_STEP;
    setGridZoom(gridView.zoom + delta);
  }, { passive: false });
}

function renderCatalog() {
  catalogEl.innerHTML = '';

  componentTemplates.forEach((template) => {
    const card = document.createElement('div');
    card.className = 'catalog-item';
    card.draggable = true;
    card.dataset.templateId = template.id;

    card.innerHTML = `
      <strong>${template.name}</strong>
      <small>
        Power: ${template.baseProperties.powerMW} MW<br>
        Footprint: ${template.baseProperties.footprint}<br>
        Throughput: ${template.baseProperties.throughputPerMin}/min
      </small>
    `;

    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('templateId', template.id);
      event.dataTransfer.effectAllowed = 'copy';
    });

    catalogEl.appendChild(card);
  });
}

function renderLegend() {
  const allResources = Array.from(new Set(componentTemplates.flatMap((c) => c.resources))).sort();
  legendEl.innerHTML = `<ul>${allResources.map((r) => `<li>${r}</li>`).join('')}</ul>`;
}

function setupDropZone() {
  dropZoneEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZoneEl.classList.add('over');
  });

  dropZoneEl.addEventListener('dragleave', () => {
    dropZoneEl.classList.remove('over');
  });

  dropZoneEl.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZoneEl.classList.remove('over');

    const templateId = event.dataTransfer.getData('templateId');
    const template = componentTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    placedComponents.push({
      instanceId: crypto.randomUUID(),
      templateId: template.id,
      name: template.name,
      count: 1,
      selected: false,
      group: null,
      recipeType: 'all',
      resource: template.resources[0],
      resourceRatePerMin: template.baseProperties.throughputPerMin,
      baseProperties: { ...template.baseProperties },
      resourceOptions: [...template.resources]
    });

    renderPlaced();
    recalcAndRenderTotals();
    refreshFactoryManagementUI();
  });
}

function setupToolbar() {
  createGroupBtn.addEventListener('click', () => {
    const name = groupNameEl.value.trim();
    if (!name) {
      return;
    }

    groups.add(name);
    groupNameEl.value = '';

    renderPlaced();
    recalcAndRenderTotals();
    refreshFactoryManagementUI();
  });

  assignGroupBtn.addEventListener('click', () => {
    const name = groupNameEl.value.trim();
    if (!name) {
      return;
    }

    groups.add(name);
    placedComponents.forEach((item) => {
      if (item.selected) {
        item.group = name;
      }
    });

    renderPlaced();
    recalcAndRenderTotals();
    refreshFactoryManagementUI();
  });

  clearSelectionBtn.addEventListener('click', () => {
    placedComponents.forEach((item) => {
      item.selected = false;
    });

    renderPlaced();
    saveStateToStorage();
  });

  exportJsonBtn.addEventListener('click', exportStateAsJsonFile);

  importJsonBtn.addEventListener('click', () => {
    importJsonInput.click();
  });

  importJsonInput.addEventListener('change', async () => {
    const [file] = importJsonInput.files || [];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      applyStatePayload(parsed);
      renderPlaced();
      recalcAndRenderTotals();
      refreshFactoryManagementUI();
    } catch (error) {
      console.warn('Unable to import JSON state.', error);
      alert('Import failed: invalid JSON file.');
    } finally {
      importJsonInput.value = '';
    }
  });

  resetAllBtn.addEventListener('click', () => {
    const confirmed = confirm('Reset everything? This will remove all items, groups, factories, connections, and saved state.');
    if (!confirmed) {
      return;
    }

    placedComponents.length = 0;
    groups.clear();
    factories.clear();
    groupFactoryMap.clear();
    resourceConnections.length = 0;

    groupNameEl.value = '';
    factoryNameEl.value = '';

    renderPlaced();
    recalcAndRenderTotals(false);
    refreshFactoryManagementUI();

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Unable to clear saved state from localStorage.', error);
    }
  });
}

function setupFactoryControls() {
  createFactoryBtn.addEventListener('click', () => {
    const name = factoryNameEl.value.trim();
    if (!name) {
      return;
    }

    ensureFactoryExists(name);
    factoryNameEl.value = '';
    refreshFactoryManagementUI();
    saveStateToStorage();
  });

  assignGroupToFactoryBtn.addEventListener('click', () => {
    const group = groupForFactorySelectEl.value;
    const factory = factoryAssignSelectEl.value;

    if (!group || !factory) {
      return;
    }

    ensureFactoryExists(factory);
    groupFactoryMap.set(group, factory);

    refreshFactoryManagementUI();
    recalcAndRenderTotals();
  });
}

function setupConnectionControls() {
  connSourceFactoryEl.addEventListener('change', () => {
    updateGroupOptionsForFactory(connSourceGroupEl, connSourceFactoryEl.value);
    updateResourceOptionsForSelection(connSourceFactoryEl.value, connSourceGroupEl.value, connSourceResourceEl);
  });

  connTargetFactoryEl.addEventListener('change', () => {
    updateGroupOptionsForFactory(connTargetGroupEl, connTargetFactoryEl.value);
    updateResourceOptionsForSelection(connTargetFactoryEl.value, connTargetGroupEl.value, connTargetResourceEl);
  });

  connSourceGroupEl.addEventListener('change', () => {
    updateResourceOptionsForSelection(connSourceFactoryEl.value, connSourceGroupEl.value, connSourceResourceEl);
  });

  connTargetGroupEl.addEventListener('change', () => {
    updateResourceOptionsForSelection(connTargetFactoryEl.value, connTargetGroupEl.value, connTargetResourceEl);
  });

  addConnectionBtn.addEventListener('click', () => {
    const sourceFactory = connSourceFactoryEl.value;
    const targetFactory = connTargetFactoryEl.value;

    if (!sourceFactory || !targetFactory) {
      return;
    }

    const sourceResource = connSourceResourceEl.value;
    const targetResource = connTargetResourceEl.value;

    if (!sourceResource || !targetResource) {
      return;
    }

    resourceConnections.push({
      id: crypto.randomUUID(),
      sourceFactory,
      sourceGroup: connSourceGroupEl.value || '',
      sourceResource,
      targetFactory,
      targetGroup: connTargetGroupEl.value || '',
      targetResource
    });

    renderConnectionList();
    drawFactoryConnections();
    saveStateToStorage();
  });
}

function renderPlaced() {
  const content = document.createElement('div');
  content.className = 'placed-list';

  if (!placedComponents.length) {
    dropZoneEl.innerHTML = '<p class="drop-hint">Drop components here</p>';
    return;
  }

  placedComponents.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = `placed-item${item.selected ? ' selected' : ''}`;

    const filteredResourceOptions = getResourcesByType(item.resourceOptions, item.recipeType || 'all');
    const safeResource = filteredResourceOptions.includes(item.resource)
      ? item.resource
      : filteredResourceOptions[0] || item.resourceOptions[0];

    if (item.resource !== safeResource) {
      item.resource = safeResource;
    }

    const groupBadge = item.group ? `<span class="badge">Group: ${item.group}</span>` : '<span class="badge">No Group</span>';
    const factoryBadge = item.group && groupFactoryMap.get(item.group)
      ? `<span class="badge">Factory: ${groupFactoryMap.get(item.group)}</span>`
      : '<span class="badge">Factory: Unassigned</span>';

    wrapper.innerHTML = `
      <div class="placed-header">
        <strong>${item.name}</strong>
        <div>${groupBadge} ${factoryBadge}</div>
      </div>
      <div class="row">
        <label>Qty</label>
        <input type="number" min="1" step="1" value="${item.count}" data-action="count" />

        <label>Recipe Type</label>
        <select data-action="recipe-type">
          <option value="all" ${item.recipeType === 'all' ? 'selected' : ''}>All</option>
          <option value="standard" ${item.recipeType === 'standard' ? 'selected' : ''}>Standard</option>
          <option value="alt" ${item.recipeType === 'alt' ? 'selected' : ''}>Alt Recipe</option>
        </select>

        <label>Produces</label>
        <select data-action="resource">
          ${filteredResourceOptions
            .map((resource) => `<option value="${resource}" ${resource === item.resource ? 'selected' : ''}>${resource}</option>`)
            .join('')}
        </select>

        <label>Rate/min</label>
        <input type="number" min="0" step="0.5" value="${item.resourceRatePerMin}" data-action="rate" />
      </div>
      <div class="row">
        <button type="button" data-action="toggle-select" class="muted">${item.selected ? 'Unselect' : 'Select'}</button>
        <button type="button" data-action="assign-existing" class="muted">Assign Existing Group</button>
        <button type="button" data-action="remove">Remove</button>
      </div>
      <div class="row">
        <small>Power total: <span class="kpi">${(item.count * item.baseProperties.powerMW).toFixed(1)} MW</span></small>
        <small> | Throughput total: <span class="kpi">${(item.count * item.baseProperties.throughputPerMin).toFixed(1)}/min</span></small>
      </div>
    `;

    const countInput = wrapper.querySelector('input[data-action="count"]');
    const recipeTypeSelect = wrapper.querySelector('select[data-action="recipe-type"]');
    const resourceSelect = wrapper.querySelector('select[data-action="resource"]');
    const rateInput = wrapper.querySelector('input[data-action="rate"]');
    const toggleBtn = wrapper.querySelector('button[data-action="toggle-select"]');
    const assignExistingBtn = wrapper.querySelector('button[data-action="assign-existing"]');
    const removeBtn = wrapper.querySelector('button[data-action="remove"]');

    countInput.addEventListener('input', () => {
      const parsed = Number(countInput.value);
      item.count = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      recalcAndRenderTotals();
      renderPlaced();
    });

    recipeTypeSelect.addEventListener('change', () => {
      item.recipeType = RECIPE_TYPES.includes(recipeTypeSelect.value) ? recipeTypeSelect.value : 'all';
      const options = getResourcesByType(item.resourceOptions, item.recipeType);
      if (!options.includes(item.resource)) {
        item.resource = options[0] || item.resourceOptions[0];
      }

      recalcAndRenderTotals();
      renderPlaced();
    });

    resourceSelect.addEventListener('change', () => {
      item.resource = resourceSelect.value;
      recalcAndRenderTotals();
      refreshFactoryManagementUI();
    });

    rateInput.addEventListener('input', () => {
      const parsed = Number(rateInput.value);
      item.resourceRatePerMin = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      recalcAndRenderTotals();
    });

    toggleBtn.addEventListener('click', () => {
      item.selected = !item.selected;
      renderPlaced();
      saveStateToStorage();
    });

    assignExistingBtn.addEventListener('click', () => {
      if (!groups.size) {
        return;
      }

      const chosen = prompt(`Assign to which group?\n\n${Array.from(groups).join('\n')}`);
      if (!chosen) {
        return;
      }

      groups.add(chosen);
      item.group = chosen;
      recalcAndRenderTotals();
      renderPlaced();
      refreshFactoryManagementUI();
    });

    removeBtn.addEventListener('click', () => {
      const index = placedComponents.findIndex((p) => p.instanceId === item.instanceId);
      if (index >= 0) {
        placedComponents.splice(index, 1);
      }
      recalcAndRenderTotals();
      renderPlaced();
      refreshFactoryManagementUI();
    });

    content.appendChild(wrapper);
  });

  dropZoneEl.innerHTML = '';
  dropZoneEl.appendChild(content);
}

function recalcAndRenderTotals(shouldPersist = true) {
  const env = {
    totalCount: 0,
    powerMW: 0,
    footprint: 0,
    throughputPerMin: 0,
    resources: {}
  };

  const grouped = {};
  const factoryTotals = {};

  placedComponents.forEach((item) => {
    const qty = item.count;
    env.totalCount += qty;
    env.powerMW += qty * item.baseProperties.powerMW;
    env.footprint += qty * item.baseProperties.footprint;
    env.throughputPerMin += qty * item.baseProperties.throughputPerMin;

    const produced = qty * item.resourceRatePerMin;
    env.resources[item.resource] = (env.resources[item.resource] || 0) + produced;

    if (item.group) {
      if (!grouped[item.group]) {
        grouped[item.group] = emptyTotals();
      }

      grouped[item.group].totalCount += qty;
      grouped[item.group].powerMW += qty * item.baseProperties.powerMW;
      grouped[item.group].footprint += qty * item.baseProperties.footprint;
      grouped[item.group].throughputPerMin += qty * item.baseProperties.throughputPerMin;
      grouped[item.group].resources[item.resource] = (grouped[item.group].resources[item.resource] || 0) + produced;

      const assignedFactory = groupFactoryMap.get(item.group);
      if (assignedFactory) {
        if (!factoryTotals[assignedFactory]) {
          factoryTotals[assignedFactory] = emptyTotals();
        }

        factoryTotals[assignedFactory].totalCount += qty;
        factoryTotals[assignedFactory].powerMW += qty * item.baseProperties.powerMW;
        factoryTotals[assignedFactory].footprint += qty * item.baseProperties.footprint;
        factoryTotals[assignedFactory].throughputPerMin += qty * item.baseProperties.throughputPerMin;
        factoryTotals[assignedFactory].resources[item.resource] = (factoryTotals[assignedFactory].resources[item.resource] || 0) + produced;
      }
    }
  });

  envTotalsEl.innerHTML = renderTotalsTable(env, 'Entire Environment');
  groupTotalsEl.innerHTML = renderGroupTables(grouped);
  factoryTotalsEl.innerHTML = renderFactoryTables(factoryTotals);

  if (shouldPersist) {
    saveStateToStorage();
  }
}

function emptyTotals() {
  return {
    totalCount: 0,
    powerMW: 0,
    footprint: 0,
    throughputPerMin: 0,
    resources: {}
  };
}

function renderTotalsTable(total, title) {
  const resourceRows = Object.keys(total.resources)
    .sort()
    .map((resource) => `<tr><td>${resource}</td><td>${total.resources[resource].toFixed(1)}/min</td></tr>`)
    .join('');

  return `
    <table class="data-table">
      <tr><th colspan="2">${title}</th></tr>
      <tr><td>Total Components</td><td>${total.totalCount.toFixed(0)}</td></tr>
      <tr><td>Total Power</td><td>${total.powerMW.toFixed(1)} MW</td></tr>
      <tr><td>Total Footprint</td><td>${total.footprint.toFixed(1)}</td></tr>
      <tr><td>Total Throughput</td><td>${total.throughputPerMin.toFixed(1)}/min</td></tr>
      <tr><th colspan="2">Resource Output</th></tr>
      ${resourceRows || '<tr><td colspan="2">No output assigned</td></tr>'}
    </table>
  `;
}

function renderGroupTables(grouped) {
  const names = Object.keys(grouped).sort();
  if (!names.length) {
    return '<p class="help-text">No groups assigned yet.</p>';
  }

  return names.map((name) => renderTotalsTable(grouped[name], `Group: ${name}`)).join('<br>');
}

function renderFactoryTables(factoryTotals) {
  const names = Object.keys(factoryTotals).sort();
  if (!names.length) {
    return '<p class="help-text">No factories with assigned groups yet.</p>';
  }

  return names.map((name) => renderTotalsTable(factoryTotals[name], `Factory: ${name}`)).join('<br>');
}

function refreshFactoryManagementUI() {
  renderFactoryAssignmentSelectors();
  renderConnectionSelectors();
  renderConnectionList();
  renderFactoryGrid();
  saveStateToStorage();
}

function renderFactoryAssignmentSelectors() {
  const groupNames = getAllKnownGroups();
  fillSelect(groupForFactorySelectEl, groupNames, { includeBlank: true, blankLabel: 'Select Group' });

  const factoryNames = Array.from(factories.keys()).sort((a, b) => a.localeCompare(b));
  fillSelect(factoryAssignSelectEl, factoryNames, { includeBlank: true, blankLabel: 'Select Factory' });
}

function renderConnectionSelectors() {
  const factoryNames = Array.from(factories.keys()).sort((a, b) => a.localeCompare(b));

  fillSelect(connSourceFactoryEl, factoryNames, { includeBlank: true, blankLabel: 'From Factory' });
  fillSelect(connTargetFactoryEl, factoryNames, { includeBlank: true, blankLabel: 'To Factory' });

  updateGroupOptionsForFactory(connSourceGroupEl, connSourceFactoryEl.value);
  updateGroupOptionsForFactory(connTargetGroupEl, connTargetFactoryEl.value);

  updateResourceOptionsForSelection(connSourceFactoryEl.value, connSourceGroupEl.value, connSourceResourceEl);
  updateResourceOptionsForSelection(connTargetFactoryEl.value, connTargetGroupEl.value, connTargetResourceEl);
}

function renderConnectionList() {
  if (!resourceConnections.length) {
    connectionListEl.innerHTML = '<p class="help-text">No connections yet.</p>';
    return;
  }

  connectionListEl.innerHTML = '';

  resourceConnections.forEach((connection) => {
    const row = document.createElement('div');
    row.className = 'connection-item';
    const connectionColor = getResourceColor(connection.sourceResource);
    row.style.borderLeftColor = connectionColor;

    const sourceGroupText = connection.sourceGroup ? ` / ${connection.sourceGroup}` : '';
    const targetGroupText = connection.targetGroup ? ` / ${connection.targetGroup}` : '';

    row.innerHTML = `
      <span class="connection-text"><span class="connection-swatch" style="background:${connectionColor}"></span>${connection.sourceFactory}${sourceGroupText} [${connection.sourceResource}] → ${connection.targetFactory}${targetGroupText} [${connection.targetResource}]</span>
      <button type="button" class="muted" data-remove-connection>Remove</button>
    `;

    row.querySelector('[data-remove-connection]').addEventListener('click', () => {
      const index = resourceConnections.findIndex((item) => item.id === connection.id);
      if (index >= 0) {
        resourceConnections.splice(index, 1);
      }

      renderConnectionList();
      drawFactoryConnections();
      saveStateToStorage();
    });

    connectionListEl.appendChild(row);
  });
}

function renderFactoryGrid() {
  factoryNodesLayerEl.innerHTML = '';

  const factoryNames = Array.from(factories.keys()).sort((a, b) => a.localeCompare(b));
  factoryNames.forEach((factoryName) => {
    const position = ensureFactoryPosition(factoryName);
    const groupsInFactory = getGroupsForFactory(factoryName);

    const node = document.createElement('div');
    node.className = 'factory-node';
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    node.dataset.factoryName = factoryName;

    node.innerHTML = `
      <strong>${factoryName}</strong>
      <small>Groups: ${groupsInFactory.length ? groupsInFactory.join(', ') : 'None'}</small>
      <small>Connections: ${countConnectionsForFactory(factoryName)}</small>
    `;

    attachFactoryNodeDrag(node, factoryName);
    factoryNodesLayerEl.appendChild(node);
  });

  drawFactoryConnections();
}

function drawFactoryConnections() {
  const width = factoryGridEl.clientWidth;
  const height = factoryGridEl.clientHeight;
  factoryConnectionsLayerEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  factoryConnectionsLayerEl.innerHTML = '';

  resourceConnections.forEach((connection) => {
    const source = factories.get(connection.sourceFactory);
    const target = factories.get(connection.targetFactory);
    if (!source || !target) {
      return;
    }

    const x1 = (source.x + NODE_WIDTH / 2) * gridView.zoom;
    const y1 = (source.y + NODE_HEIGHT / 2) * gridView.zoom;
    const x2 = (target.x + NODE_WIDTH / 2) * gridView.zoom;
    const y2 = (target.y + NODE_HEIGHT / 2) * gridView.zoom;
    const connectionColor = getResourceColor(connection.sourceResource);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'factory-line');
    line.setAttribute('stroke', connectionColor);
    factoryConnectionsLayerEl.appendChild(line);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', ((x1 + x2) / 2) + 4);
    label.setAttribute('y', ((y1 + y2) / 2) - 4);
    label.setAttribute('class', 'factory-line-label');
    label.setAttribute('fill', connectionColor);
    label.textContent = `${connection.sourceResource} → ${connection.targetResource}`;
    factoryConnectionsLayerEl.appendChild(label);
  });
}

function setGridZoom(nextZoom) {
  const snapped = Math.round(nextZoom * 100) / 100;
  gridView.zoom = clamp(snapped, MIN_GRID_ZOOM, MAX_GRID_ZOOM);
  applyFactoryGridView();
  renderFactoryGrid();
  saveStateToStorage();
}

function fitMapToGrid() {
  if (!factories.size) {
    setGridZoom(1);
    return;
  }

  const bounds = getFactoryBounds();
  if (!bounds) {
    setGridZoom(1);
    return;
  }

  const viewportWidth = factoryGridEl.clientWidth;
  const viewportHeight = factoryGridEl.clientHeight;
  if (!viewportWidth || !viewportHeight) {
    return;
  }

  const padding = 30;
  const requiredBaseWidth = bounds.width + (padding * 2);
  const requiredBaseHeight = bounds.height + (padding * 2);

  const widthZoom = requiredBaseWidth > 0 ? viewportWidth / requiredBaseWidth : 1;
  const heightZoom = requiredBaseHeight > 0 ? viewportHeight / requiredBaseHeight : 1;
  const targetZoom = clamp(Math.min(widthZoom, heightZoom), MIN_GRID_ZOOM, MAX_GRID_ZOOM);

  gridView.zoom = targetZoom;
  applyFactoryGridView();

  const baseWidth = viewportWidth / gridView.zoom;
  const baseHeight = viewportHeight / gridView.zoom;
  const targetMinX = Math.max(0, (baseWidth - bounds.width) / 2);
  const targetMinY = Math.max(0, (baseHeight - bounds.height) / 2);
  const deltaX = targetMinX - bounds.minX;
  const deltaY = targetMinY - bounds.minY;

  factories.forEach((position, name) => {
    const movedX = position.x + deltaX;
    const movedY = position.y + deltaY;
    const maxX = Math.max(0, baseWidth - NODE_WIDTH);
    const maxY = Math.max(0, baseHeight - NODE_HEIGHT);

    factories.set(name, {
      x: clamp(movedX, 0, maxX),
      y: clamp(movedY, 0, maxY)
    });
  });

  renderFactoryGrid();
  saveStateToStorage();
}

function getFactoryBounds() {
  const values = Array.from(factories.values());
  if (!values.length) {
    return null;
  }

  const minX = Math.min(...values.map((p) => p.x));
  const minY = Math.min(...values.map((p) => p.y));
  const maxRight = Math.max(...values.map((p) => p.x + NODE_WIDTH));
  const maxBottom = Math.max(...values.map((p) => p.y + NODE_HEIGHT));

  return {
    minX,
    minY,
    maxRight,
    maxBottom,
    width: Math.max(1, maxRight - minX),
    height: Math.max(1, maxBottom - minY)
  };
}

function applyFactoryGridView() {
  const zoom = gridView.zoom;
  const zoomPercent = Math.round(zoom * 100);

  zoomLevelLabel.textContent = `${zoomPercent}%`;

  const transform = `scale(${zoom})`;
  factoryGridPatternEl.style.transform = transform;
  factoryConnectionsLayerEl.style.transform = 'none';
  factoryNodesLayerEl.style.transform = transform;

  updateFactoryGridSizing();

  if (gridView.mapImage) {
    factoryMapLayerEl.style.backgroundImage = `url(${gridView.mapImage})`;

    if (!gridView.mapAspectRatio && !gridView.mapAspectResolving) {
      gridView.mapAspectResolving = true;
      getImageAspectRatio(gridView.mapImage)
        .then((ratio) => {
          if (ratio) {
            gridView.mapAspectRatio = ratio;
            updateFactoryGridSizing();
            renderFactoryGrid();
            saveStateToStorage();
          }
        })
        .finally(() => {
          gridView.mapAspectResolving = false;
        });
    }
  } else {
    factoryMapLayerEl.style.backgroundImage = 'none';
  }
}

function updateFactoryGridSizing() {
  if (gridView.mapAspectRatio && Number.isFinite(gridView.mapAspectRatio) && gridView.mapAspectRatio > 0) {
    const width = factoryGridEl.clientWidth;
    if (width > 0) {
      const height = Math.max(260, Math.round(width / gridView.mapAspectRatio));
      factoryGridEl.style.height = `${height}px`;
      return;
    }
  }

  factoryGridEl.style.height = `${DEFAULT_GRID_HEIGHT}px`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ''));
    };

    reader.onerror = () => {
      reject(new Error('File read failed'));
    };

    reader.readAsDataURL(file);
  });
}

function getImageAspectRatio(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(image.naturalWidth / image.naturalHeight);
      } else {
        reject(new Error('Image dimensions unavailable'));
      }
    };

    image.onerror = () => {
      reject(new Error('Image load failed'));
    };

    image.src = dataUrl;
  });
}

function attachFactoryNodeDrag(node, factoryName) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  node.addEventListener('mousedown', (event) => {
    isDragging = true;
    const rect = node.getBoundingClientRect();
    offsetX = (event.clientX - rect.left) / gridView.zoom;
    offsetY = (event.clientY - rect.top) / gridView.zoom;

    const onMove = (moveEvent) => {
      if (!isDragging) {
        return;
      }

      const gridRect = factoryGridEl.getBoundingClientRect();
      const baseWidth = gridRect.width / gridView.zoom;
      const baseHeight = gridRect.height / gridView.zoom;

      let x = ((moveEvent.clientX - gridRect.left) / gridView.zoom) - offsetX;
      let y = ((moveEvent.clientY - gridRect.top) / gridView.zoom) - offsetY;

      x = clamp(x, 0, Math.max(0, baseWidth - NODE_WIDTH));
      y = clamp(y, 0, Math.max(0, baseHeight - NODE_HEIGHT));

      node.style.left = `${x}px`;
      node.style.top = `${y}px`;

      factories.set(factoryName, { x, y });
      drawFactoryConnections();
    };

    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveStateToStorage();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function updateGroupOptionsForFactory(selectEl, factoryName) {
  const groupsInFactory = factoryName ? getGroupsForFactory(factoryName) : [];
  fillSelect(selectEl, groupsInFactory, { includeBlank: true, blankLabel: 'Any Group' });
}

function updateResourceOptionsForSelection(factoryName, groupName, selectEl) {
  const resources = getResourcesForFactoryGroup(factoryName, groupName);
  fillSelect(selectEl, resources, { includeBlank: true, blankLabel: 'Select Resource' });
}

function getResourcesForFactoryGroup(factoryName, groupName) {
  const resources = new Set();

  placedComponents.forEach((item) => {
    if (!item.group) {
      return;
    }

    const assignedFactory = groupFactoryMap.get(item.group);
    if (factoryName && assignedFactory !== factoryName) {
      return;
    }

    if (groupName && item.group !== groupName) {
      return;
    }

    resources.add(item.resource);
  });

  if (resources.size > 0) {
    return Array.from(resources).sort((a, b) => a.localeCompare(b));
  }

  return Array.from(new Set(componentTemplates.flatMap((template) => template.resources))).sort((a, b) => a.localeCompare(b));
}

function getAllKnownGroups() {
  placedComponents.forEach((item) => {
    if (item.group) {
      groups.add(item.group);
    }
  });

  return Array.from(groups).sort((a, b) => a.localeCompare(b));
}

function getGroupsForFactory(factoryName) {
  const groupNames = [];

  groupFactoryMap.forEach((value, key) => {
    if (value === factoryName) {
      groupNames.push(key);
    }
  });

  return groupNames.sort((a, b) => a.localeCompare(b));
}

function countConnectionsForFactory(factoryName) {
  return resourceConnections.filter((connection) => connection.sourceFactory === factoryName || connection.targetFactory === factoryName).length;
}

function ensureFactoryExists(name) {
  if (!factories.has(name)) {
    const index = factories.size;
    const x = 20 + (index % 4) * (NODE_WIDTH + 18);
    const y = 20 + Math.floor(index / 4) * (NODE_HEIGHT + 18);
    factories.set(name, { x, y });
  }
}

function ensureFactoryPosition(name) {
  ensureFactoryExists(name);
  const position = factories.get(name);

  const maxX = Math.max(0, (factoryGridEl.clientWidth / gridView.zoom) - NODE_WIDTH);
  const maxY = Math.max(0, (factoryGridEl.clientHeight / gridView.zoom) - NODE_HEIGHT);

  position.x = clamp(position.x, 0, maxX);
  position.y = clamp(position.y, 0, maxY);

  factories.set(name, position);
  return position;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function throttle(callback, delayMs = 80) {
  let timeoutId = null;
  let lastRun = 0;

  return (...args) => {
    const now = Date.now();
    const remaining = delayMs - (now - lastRun);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      lastRun = now;
      callback(...args);
      return;
    }

    if (timeoutId) {
      return;
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      lastRun = Date.now();
      callback(...args);
    }, remaining);
  };
}

function fillSelect(selectEl, items, options = {}) {
  const { includeBlank = false, blankLabel = 'Select' } = options;
  const previous = selectEl.value;

  selectEl.innerHTML = '';

  if (includeBlank) {
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = blankLabel;
    selectEl.appendChild(blankOption);
  }

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    selectEl.appendChild(option);
  });

  if (previous && items.includes(previous)) {
    selectEl.value = previous;
  }
}

function saveStateToStorage() {
  const payload = buildStatePayload();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to save tracker state to localStorage.', error);
  }

  try {
    const corePayload = buildCoreStatePayload(payload);
    localStorage.setItem(STORAGE_KEY_CORE, JSON.stringify(corePayload));
  } catch (error) {
    console.warn('Unable to save fallback tracker state to localStorage.', error);
  }
}

function hydrateStateFromStorage() {
  try {
    const fullRaw = localStorage.getItem(STORAGE_KEY);
    if (fullRaw) {
      const parsed = JSON.parse(fullRaw);
      applyStatePayload(parsed);
      setFallbackStorageBadgeVisible(false);
      return;
    }

    const coreRaw = localStorage.getItem(STORAGE_KEY_CORE);
    if (!coreRaw) {
      setFallbackStorageBadgeVisible(false);
      return;
    }

    const coreParsed = JSON.parse(coreRaw);
    applyStatePayload(coreParsed);
    setFallbackStorageBadgeVisible(true);
  } catch (error) {
    setFallbackStorageBadgeVisible(false);
    console.warn('Unable to load tracker state from localStorage.', error);
  }
}

function buildStatePayload() {
  return {
    groups: Array.from(groups),
    gridView: {
      zoom: gridView.zoom,
      mapImage: gridView.mapImage,
      mapAspectRatio: gridView.mapAspectRatio
    },
    factories: Array.from(factories.entries()).map(([name, position]) => ({ name, x: position.x, y: position.y })),
    groupFactoryAssignments: Array.from(groupFactoryMap.entries()).map(([group, factory]) => ({ group, factory })),
    resourceConnections: resourceConnections.map((connection) => ({ ...connection })),
    placedComponents: placedComponents.map((item) => ({
      instanceId: item.instanceId,
      templateId: item.templateId,
      count: item.count,
      selected: item.selected,
      group: item.group,
      recipeType: item.recipeType,
      resource: item.resource,
      resourceRatePerMin: item.resourceRatePerMin
    }))
  };
}

function buildCoreStatePayload(payload) {
  return {
    ...payload,
    gridView: {
      ...payload.gridView,
      mapImage: ''
    }
  };
}

function setFallbackStorageBadgeVisible(isVisible) {
  if (!fallbackStorageBadgeEl) {
    return;
  }

  fallbackStorageBadgeEl.hidden = !isVisible;
}

function applyStatePayload(payload) {
  const savedGroups = Array.isArray(payload?.groups) ? payload.groups : [];
  const savedPlaced = Array.isArray(payload?.placedComponents) ? payload.placedComponents : [];
  const savedFactories = Array.isArray(payload?.factories) ? payload.factories : [];
  const savedAssignments = Array.isArray(payload?.groupFactoryAssignments) ? payload.groupFactoryAssignments : [];
  const savedConnections = Array.isArray(payload?.resourceConnections) ? payload.resourceConnections : [];
  const savedGridView = payload?.gridView && typeof payload.gridView === 'object' ? payload.gridView : null;

  groups.clear();
  factories.clear();
  groupFactoryMap.clear();
  resourceConnections.length = 0;
  placedComponents.length = 0;

  savedGroups
    .filter((name) => typeof name === 'string' && name.trim().length > 0)
    .forEach((name) => groups.add(name.trim()));

  savedFactories.forEach((factory) => {
    if (typeof factory?.name !== 'string' || !factory.name.trim()) {
      return;
    }

    factories.set(factory.name.trim(), {
      x: Number.isFinite(Number(factory.x)) ? Number(factory.x) : 20,
      y: Number.isFinite(Number(factory.y)) ? Number(factory.y) : 20
    });
  });

  savedAssignments.forEach((entry) => {
    if (typeof entry?.group !== 'string' || typeof entry?.factory !== 'string') {
      return;
    }

    const groupName = entry.group.trim();
    const factoryName = entry.factory.trim();
    if (!groupName || !factoryName) {
      return;
    }

    groups.add(groupName);
    ensureFactoryExists(factoryName);
    groupFactoryMap.set(groupName, factoryName);
  });

  savedPlaced.forEach((item) => {
    const template = componentTemplates.find((t) => t.id === item.templateId);
    if (!template) {
      return;
    }

    const count = Number(item.count);
    const resourceRatePerMin = Number(item.resourceRatePerMin);
    const recipeType = typeof item.recipeType === 'string' ? item.recipeType.toLowerCase() : 'all';
    const safeRecipeType = RECIPE_TYPES.includes(recipeType) ? recipeType : 'all';
    const safeGroup = typeof item.group === 'string' && item.group.trim().length > 0 ? item.group.trim() : null;

    if (safeGroup) {
      groups.add(safeGroup);
    }

    const safeResource = template.resources.includes(item.resource) ? item.resource : template.resources[0];

    placedComponents.push({
      instanceId: typeof item.instanceId === 'string' && item.instanceId ? item.instanceId : crypto.randomUUID(),
      templateId: template.id,
      name: template.name,
      count: Number.isFinite(count) && count > 0 ? count : 1,
      selected: Boolean(item.selected),
      group: safeGroup,
      recipeType: safeRecipeType,
      resource: safeResource,
      resourceRatePerMin: Number.isFinite(resourceRatePerMin) && resourceRatePerMin >= 0 ? resourceRatePerMin : template.baseProperties.throughputPerMin,
      baseProperties: { ...template.baseProperties },
      resourceOptions: [...template.resources]
    });
  });

  savedConnections.forEach((connection) => {
    if (!connection || typeof connection !== 'object') {
      return;
    }

    const sourceFactory = typeof connection.sourceFactory === 'string' ? connection.sourceFactory.trim() : '';
    const targetFactory = typeof connection.targetFactory === 'string' ? connection.targetFactory.trim() : '';
    const sourceResource = typeof connection.sourceResource === 'string' ? connection.sourceResource.trim() : '';
    const targetResource = typeof connection.targetResource === 'string' ? connection.targetResource.trim() : '';

    if (!sourceFactory || !targetFactory || !sourceResource || !targetResource) {
      return;
    }

    ensureFactoryExists(sourceFactory);
    ensureFactoryExists(targetFactory);

    resourceConnections.push({
      id: typeof connection.id === 'string' && connection.id ? connection.id : crypto.randomUUID(),
      sourceFactory,
      sourceGroup: typeof connection.sourceGroup === 'string' ? connection.sourceGroup : '',
      sourceResource,
      targetFactory,
      targetGroup: typeof connection.targetGroup === 'string' ? connection.targetGroup : '',
      targetResource
    });
  });

  if (savedGridView) {
    const parsedZoom = Number(savedGridView.zoom);
    const parsedAspectRatio = Number(savedGridView.mapAspectRatio);
    gridView.zoom = Number.isFinite(parsedZoom)
      ? clamp(Math.round(parsedZoom * 100) / 100, MIN_GRID_ZOOM, MAX_GRID_ZOOM)
      : 1;

    gridView.mapImage = typeof savedGridView.mapImage === 'string' ? savedGridView.mapImage : '';
    gridView.mapAspectRatio = Number.isFinite(parsedAspectRatio) && parsedAspectRatio > 0 ? parsedAspectRatio : null;
  } else {
    gridView.zoom = 1;
    gridView.mapImage = '';
    gridView.mapAspectRatio = null;
  }
}

function exportStateAsJsonFile() {
  try {
    const payload = buildStatePayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `factory-tracker-${timestamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('Unable to export JSON state.', error);
    alert('Export failed.');
  }
}

function getRecipeType(resourceName) {
  return resourceName.includes('(Alt Recipe)') ? 'alt' : 'standard';
}

function getResourcesByType(resources, recipeType) {
  if (recipeType === 'all') {
    return [...resources];
  }

  return resources.filter((resource) => getRecipeType(resource) === recipeType);
}

function getResourceColor(resourceName) {
  const palette = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#4e79a7',
    '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948'
  ];

  let hash = 0;
  for (let index = 0; index < resourceName.length; index += 1) {
    hash = ((hash << 5) - hash) + resourceName.charCodeAt(index);
    hash |= 0;
  }

  const colorIndex = Math.abs(hash) % palette.length;
  return palette[colorIndex];
}
