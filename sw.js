/**
 * Obtiene el correo autenticado del almacenamiento local o usa un respaldo por defecto,
 * formateándolo como parámetro URL para enviarlo en las peticiones a Google Apps Script.
 */
function getAuthEmailParam() {
  const email = (localStorage.getItem("finca_user_email") || "danielfrancop@gmail.com").trim().toLowerCase();
  return "&email=" + encodeURIComponent(email);
}

var MI_GAS_URL = "https://script.google.com/macros/s/AKfycbxZXNYHGFVSWGQOEsmOsmzrQTog5Sxb4EXQjvsJmpx9W8OBRbO_l6xL1drnmPedfaUH/exec";

// --- INDEXEDDB & OFFLINE PWA MANAGER ---
const DB_NAME = 'FincaSaucesOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_records';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveOfflineRecord(tipo, record) {
    try {
        const db = await openOfflineDB();
        if (!db) return null;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const item = {
                tipo: tipo,
                record: record,
                estado: 'pendiente_sincronizacion',
                timestamp: new Date().getTime()
            };
            const req = store.add(item);
            req.onsuccess = (e) => {
                updatePendingSyncBadge();
                resolve(e.target.result);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error("Error al guardar en IndexedDB:", err);
        return null;
    }
}

async function getOfflineRecords() {
    try {
        const db = await openOfflineDB();
        if (!db) return [];
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error("Error leyendo de IndexedDB:", err);
        return [];
    }
}

async function deleteOfflineRecord(id) {
    try {
        const db = await openOfflineDB();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => {
                updatePendingSyncBadge();
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (err) {
        console.error("Error borrando registro de IndexedDB:", err);
    }
}

async function updatePendingSyncBadge() {
    const records = await getOfflineRecords();
    const badge = document.getElementById("pendingSyncBadge");
    const btn = document.getElementById("syncOfflineBtn");
    const count = records.length;
    if (badge) badge.textContent = count;
    if (btn) {
        if (count > 0) {
            btn.classList.remove("hidden");
        } else {
            btn.classList.add("hidden");
        }
    }
}

function toggleDesktopNavDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById("desktopNavDropdownMenu");
    if (menu) {
        menu.classList.toggle("hidden");
    }
}

async function syncOfflineData() {
    if (!navigator.onLine) {
        alert("Sin conexión a Internet. Conéctate a una red para sincronizar con Google Sheets.");
        return;
    }

    const pending = await getOfflineRecords();
    if (pending.length === 0) {
        alert("No hay registros pendientes por sincronizar.");
        return;
    }

    showLoader(true, `Sincronizando ${pending.length} registro(s) pendiente(s)...`);

    let syncedCount = 0;
    for (const item of pending) {
        try {
            await new Promise((resolve, reject) => {
                if (typeof google !== 'undefined' && google.script && google.script.run) {
                    let runner = google.script.run
                        .withSuccessHandler((res) => {
                            if (res && res.success) resolve(res);
                            else reject(res ? res.error : "Error en servidor");
                        })
                        .withFailureHandler((err) => reject(err));

                    if (item.tipo === 'fotosLotes' || item.tipo === 'foto') {
                        runner.guardarFotoLote(item.record);
                    } else if (item.tipo === 'gastosPersonales') {
                        runner.guardarGastoPersonal(item.record);
                    } else {
                        runner.guardarRegistro(item.tipo, item.record);
                    }
                } else {
                    setTimeout(() => resolve({ success: true }), 300);
                }
            });
            await deleteOfflineRecord(item.id);
            syncedCount++;
        } catch (err) {
            console.error("Error sincronizando registro ID:", item.id, err);
        }
    }

    showLoader(false);
    await updatePendingSyncBadge();

    if (syncedCount > 0) {
        alert(`¡Sincronización completada! Se subieron ${syncedCount} registro(s) exitosamente a Google Sheets / Drive.`);
        fetchData();
    } else {
        alert("Ocurrió un problema al intentar sincronizar los registros.");
    }
}

// --- THEME / MODE SELECTION LOGIC ---
function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        document.getElementById("themeToggleIcon").textContent = "🌙";
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById("themeToggleIcon").textContent = "☀️";
    }
}

function initThemeIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    const icon = document.getElementById("themeToggleIcon");
    if (icon) {
        icon.textContent = isDark ? "☀️" : "🌙";
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initThemeIcon);
} else {
    initThemeIcon();
}

const yearEl = document.getElementById('currentYear');
if (yearEl) yearEl.textContent = new Date().getFullYear();

let rawData = null;
let barChartInstance = null;
let doughnutChartInstance = null;

function formatCOP(val) {
    const num = Math.round(Number(val) || 0);
    const isNegative = num < 0;
    const absoluteValue = Math.abs(num);
    const formatted = absoluteValue.toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    return `${isNegative ? '-' : ''}$${formatted}`;
}

function updateLoteSummaryMetrics(loteId, calcGastos, calcUnidades, calcPrecioVenta) {
    const currentLote = loteId || document.getElementById("filterLote")?.value || "Todos";
    
    const cardTitleEl = document.getElementById("kpiResumenLoteTitulo");
    if (cardTitleEl) {
        if (currentLote && currentLote !== "Todos") {
            cardTitleEl.textContent = `Resumen de Lote [${currentLote}]`;
        } else {
            cardTitleEl.textContent = "Resumen de Lote";
        }
    }

    const inputPrecio = document.getElementById("inputPrecioMercadoRef");
    let precioRef = inputPrecio ? parseFloat(inputPrecio.value) : 0;
    if (isNaN(precioRef) || precioRef <= 0) {
        precioRef = calcPrecioVenta || 0;
    }

    const cuEl = document.getElementById("kpiCostoUnitario");
    const sideCuEl = document.getElementById("kpiSideCostoUnitario");
    const badgeTipoEl = document.getElementById("kpiTipoProduccionBadge");
    const badgeStatusEl = document.getElementById("kpiStatusRentabilidadBadge");
    const margenValEl = document.getElementById("kpiMargenUnitarioVal");
    const pctValEl = document.getElementById("kpiPctRentabilidadVal");
    const projectedUnitsSubtextEl = document.getElementById("kpiUnidadesProyectadasSubtext");

    let totalCost = calcGastos !== undefined ? calcGastos : 0;
    let qty = calcUnidades !== undefined ? calcUnidades : 0;
    let isEstimated = false;

    if (qty <= 0) {
        isEstimated = true;
        const iniRecords = (rawData?.gastosIniciales || []).filter(item => isLoteMatch(item.Lote || item.lote, currentLote));
        const seedQty = iniRecords.reduce((sum, item) => sum + (Number(item.Cantidad || item.cantidad) || 0), 0);
        qty = seedQty > 0 ? seedQty * 2.8 : 0;
    }

    const unitCost = qty > 0 ? (totalCost / qty) : 0;
    const unitMargin = (precioRef > 0 && unitCost > 0) ? (precioRef - unitCost) : (precioRef > 0 ? precioRef : 0);
    const pctRentabilidad = (precioRef > 0) ? (((precioRef - unitCost) / precioRef) * 100) : (unitCost > 0 ? -100 : 0);

    let healthColor = "VERDE";
    if (unitCost > 0 && precioRef > 0 && unitCost > precioRef) {
        healthColor = "ROJO";
    } else if (pctRentabilidad >= 0 && pctRentabilidad <= 15) {
        healthColor = "AMARILLO";
    } else if (pctRentabilidad < 0) {
        healthColor = "ROJO";
    } else {
        healthColor = "VERDE";
    }

    let unidadMedida = "Atados";
    if (rawData) {
        const vts = (rawData.ventas || []).filter(item => isLoteMatch(item.Lote || item.lote, currentLote));
        const inis = (rawData.gastosIniciales || []).filter(item => isLoteMatch(item.Lote || item.lote, currentLote));
        if (vts.length > 0 && (vts[0].Unidad_Medida || vts[0].unidad_medida)) {
            unidadMedida = vts[0].Unidad_Medida || vts[0].unidad_medida;
        } else if (inis.length > 0 && (inis[0].Unidad_Medida || inis[0].unidad_medida)) {
            unidadMedida = inis[0].Unidad_Medida || inis[0].unidad_medida;
        }
    }

    let unidadSingular = unidadMedida.trim();
    if (unidadSingular.toLowerCase() === "atados") unidadSingular = "Atado";
    else if (unidadSingular.toLowerCase() === "bultos") unidadSingular = "Bulto";
    else if (unidadSingular.toLowerCase() === "unidades") unidadSingular = "Unidad";
    else if (unidadSingular.endsWith("s") && unidadSingular.length > 3) unidadSingular = unidadSingular.slice(0, -1);

    if (cuEl) cuEl.textContent = unitCost > 0 ? `${formatCOP(unitCost)} / ${unidadSingular}` : `$0 / ${unidadSingular}`;
    if (sideCuEl) sideCuEl.textContent = `${formatCOP(unitCost)} / ${unidadSingular}`;

    if (projectedUnitsSubtextEl) {
        projectedUnitsSubtextEl.textContent = `Unidades Proyectadas: ${Math.round(qty).toLocaleString('es-CO')} ${unidadSingular}${qty !== 1 ? 's' : ''}`;
    }
    
    if (badgeTipoEl) {
        if (isEstimated) {
            badgeTipoEl.innerHTML = `Basado en Estimación`;
            badgeTipoEl.className = "inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800";
        } else {
            badgeTipoEl.innerHTML = `✨ Cosecha Real`;
            badgeTipoEl.className = "inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
        }
    }

    if (badgeStatusEl) {
        let badgeSymbol = "🟢";
        let badgeClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800";

        if (healthColor === "AMARILLO") {
            badgeSymbol = "🟡";
            badgeClass = "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
        } else if (healthColor === "ROJO") {
            badgeSymbol = "🔴";
            badgeClass = "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400 border border-rose-200 dark:border-rose-800";
        }

        badgeStatusEl.textContent = `${badgeSymbol} ${pctRentabilidad >= 0 ? '+' : ''}${pctRentabilidad.toFixed(1)}%`;
        badgeStatusEl.className = `px-2.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-xs flex items-center gap-1 ${badgeClass}`;
    }

    if (margenValEl) {
        margenValEl.textContent = formatCOP(unitMargin);
        margenValEl.className = unitMargin >= 0 ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : "text-rose-600 dark:text-rose-400 font-extrabold";
    }

    if (pctValEl) {
        pctValEl.textContent = `${pctRentabilidad.toFixed(1)}%`;
        pctValEl.className = healthColor === "ROJO" ? "text-rose-600 font-extrabold" : (healthColor === "AMARILLO" ? "text-amber-600 font-extrabold" : "text-emerald-600 font-extrabold");
    }
}
window.updateLoteSummaryMetrics = updateLoteSummaryMetrics;

function updateSyncTimestamp(customDateStr) {
    let formattedTime = "";
    if (customDateStr) {
        formattedTime = customDateStr;
    } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        formattedTime = `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    const headerSubtitle = document.getElementById("headerSubtitle");
    if (headerSubtitle) {
        const currentText = headerSubtitle.textContent || "";
        let baseUbicacion = "Ubicación: Manizales, Caldas";
        if (currentText.includes("|")) {
            baseUbicacion = currentText.split("|")[0].trim();
        }
        headerSubtitle.textContent = `${baseUbicacion} | Última Sincronización: ${formattedTime}`;
    }
}

function fetchData(forceRefresh = false) {
    const CACHE_KEY = "finca_dashboard_cache_data";
    
    if (!forceRefresh) {
        try {
            const cachedStr = sessionStorage.getItem(CACHE_KEY);
            if (cachedStr) {
                const cachedData = JSON.parse(cachedStr);
                if (cachedData && typeof cachedData === 'object') {
                    rawData = cachedData;
                    handleDataLoaded(rawData);
                    showLoader(false);
                }
            }
        } catch (e) {
            console.warn("Error leyendo de sessionStorage:", e);
        }
    }

    const iconDesktop = document.getElementById("iconRefrescar");
    const iconMobile = document.getElementById("iconRefrescarMobile");
    if (iconDesktop) iconDesktop.classList.add("animate-spin");
    if (iconMobile) iconMobile.classList.add("animate-spin");

    showLoader(true, "Refrescando datos desde el servidor...");
    hideError();

    const stopSpin = () => {
        if (iconDesktop) iconDesktop.classList.remove("animate-spin");
        if (iconMobile) iconMobile.classList.remove("animate-spin");
    };

    if (typeof google === 'undefined' || !google.script || !google.script.run) {
        console.warn("Conectando a Google Sheets vía JSONP...");
        
        const callbackName = 'jsonpCallback_' + Math.round(100000 * Math.random());
        
        window[callbackName] = function(dataFinal) {
            stopSpin();
            if (dataFinal && dataFinal.success) {
                rawData = dataFinal.data;
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(rawData)); } catch(e){}
                updateConfigHeader();
                updateSyncTimestamp();
                applyFilters();
                fetchSecurityCredentialsBackend();
                showLoader(false);
            } else if (dataFinal) {
                rawData = dataFinal;
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(rawData)); } catch(e){}
                updateConfigHeader();
                updateSyncTimestamp();
                applyFilters();
                fetchSecurityCredentialsBackend();
                showLoader(false);
            } else {
                showError("No se obtuvo respuesta válida de Google.");
            }
            
            if (document.body.contains(script)) document.body.removeChild(script);
            delete window[callbackName];
        };

        const script = document.createElement('script');
        script.src = MI_GAS_URL + '?action=getDashboardData&callback=' + callbackName;
        
        script.onerror = function() {
            stopSpin();
            showError("Error de conexión al cargar los datos (JSONP).");
            if (document.body.contains(script)) document.body.removeChild(script);
            delete window[callbackName];
        };

        document.body.appendChild(script);
        return;
    } 
    
    google.script.run
        .withSuccessHandler(function(response) {
            stopSpin();
            if (response && response.success) {
                rawData = response.data;
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(rawData)); } catch(e){}
                updateConfigHeader();
                updateSyncTimestamp();
                applyFilters();
                fetchSecurityCredentialsBackend();
            } else {
                showError("Error en los datos recibidos.");
            }
            showLoader(false);
        })
        .withFailureHandler(function(err) {
            stopSpin();
            showError("Error de conexión: " + err.toString());
        })
        .getDashboardData();
}

function updateConfigHeader() {
    if (!rawData || !rawData.configuracion) return;
    const configMap = {};
    (rawData.configuracion || []).forEach(item => {
        const param = String(item.Parametro || item.parametro).trim();
        const valor = String(item.Valor || item.valor).trim();
        if (param) configMap[param] = valor;
    });

    const nombreFinca = configMap["Nombre_Finca"] || "Finca Los Sauces";
    const ubicacion = configMap["Ubicacion"] || "Manizales, Caldas";
    let actualizacion = configMap["Fecha_Actualizacion_Dashboard"] || "";

    if (!actualizacion) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        actualizacion = `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    document.getElementById("headerTitle").textContent = nombreFinca;
    let subtitleText = `Ubicación: ${ubicacion} | Última Sincronización: ${actualizacion}`;
    document.getElementById("headerSubtitle").textContent = subtitleText;
    populateDropdowns();
}

function normalizeLoteStr(str) {
    if (!str) return "";
    let s = String(str).toUpperCase().trim();
    s = s.replace(/\(CONSOLIDADO.*?\)/g, "").trim();
    s = s.replace(/LOTE\s*/g, "").replace(/\-/g, "").replace(/\s+/g, "");
    return s;
}

function isLoteMatch(itemLoteStr, targetLoteStr) {
    const target = String(targetLoteStr || "Todos").trim();
    if (!target || target === "Todos") return true;

    const normTarget = normalizeLoteStr(target);
    const normItem = normalizeLoteStr(itemLoteStr);

    if (normTarget === "TODOS" || normTarget === "") return true;
    if (normItem === normTarget) return true;

    if (/^\d+$/.test(normTarget)) {
        const pattern = new RegExp("^" + normTarget + "[A-Z]+$");
        if (pattern.test(normItem)) return true;
    }

    return false;
}

function updateCicloDropdown(selectedLote) {
    const container = document.getElementById("filterCicloContainer");
    const cicloSelect = document.getElementById("filterCiclo");
    if (!container || !cicloSelect) return;

    if (!selectedLote || selectedLote === "Todos") {
        container.classList.add("hidden");
        cicloSelect.innerHTML = '<option value="Todos">Todos los Ciclos (Histórico General)</option>';
        cicloSelect.value = "Todos";
        return;
    }

    container.classList.remove("hidden");
    const previousVal = cicloSelect.value;
    const cycleCodesSet = new Set();

    if (rawData && rawData.ciclos) {
        (rawData.ciclos || []).forEach(c => {
            if (isLoteMatch(c.Lote || c.lote || c.Lote_Principal || c.lote_principal, selectedLote)) {
                const code = String(c.Codigo_General || c.codigo_general || c.Codigo_Inicial || c.codigo_inicial || "").trim().toUpperCase();
                if (code) cycleCodesSet.add(code);
            }
        });
    }

    ['gastosIniciales', 'gastosDesarrollo', 'ventas'].forEach(key => {
        if (rawData && rawData[key]) {
            (rawData[key] || []).forEach(item => {
                if (isLoteMatch(item.Lote || item.lote, selectedLote)) {
                    const code = String(item.Codigo_Seguimiento || item.codigo_seguimiento || item.Codigo_General || item.codigo_general || "").trim().toUpperCase();
                    if (code && code !== "-" && code !== "SIN CÓDIGO") cycleCodesSet.add(code);
                }
            });
        }
    });

    let optionsHTML = '<option value="Todos">Todos los Ciclos (Histórico General)</option>';
    Array.from(cycleCodesSet).sort().forEach(code => {
        optionsHTML += `<option value="${code}">${code}</option>`;
    });

    cicloSelect.innerHTML = optionsHTML;
    if (previousVal && Array.from(cycleCodesSet).includes(previousVal)) {
        cicloSelect.value = previousVal;
    } else {
        cicloSelect.value = "Todos";
    }
}

function syncSelectors(source) {
    const headerSelect = document.getElementById("loteSelector");
    const barSelect = document.getElementById("filterLote");
    const cfSelect = document.getElementById("cashflowLoteSelector");

    let targetVal = "Todos";
    if (source === 'header' && headerSelect) targetVal = headerSelect.value;
    else if (source === 'bar' && barSelect) targetVal = barSelect.value;
    else if (source === 'cashflow' && cfSelect) targetVal = cfSelect.value;

    if (headerSelect && headerSelect.value !== targetVal) headerSelect.value = targetVal;
    if (barSelect && barSelect.value !== targetVal) barSelect.value = targetVal;
    if (cfSelect && cfSelect.value !== targetVal) cfSelect.value = targetVal;

    updateCicloDropdown(targetVal);
    applyFilters();
}

function setPeriod(period) {
    const today = new Date();
    const year = today.getFullYear();
    let desde = "";
    let hasta = "";

    if (period === 'este_mes') {
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(year, today.getMonth() + 1, 0).getDate();
        desde = `${year}-${month}-01`;
        hasta = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'primer_semestre') {
        desde = `${year}-01-01`;
        hasta = `${year}-06-30`;
    } else if (period === 'segundo_semestre') {
        desde = `${year}-07-01`;
        hasta = `${year}-12-31`;
    } else if (period === 'todo') {
        desde = "";
        hasta = "";
        const filterLote = document.getElementById("filterLote");
        if (filterLote) filterLote.value = "Todos";
        const filterCultivo = document.getElementById("filterCultivo");
        if (filterCultivo) filterCultivo.value = "Todos";
        const filterCiclo = document.getElementById("filterCiclo");
        if (filterCiclo) filterCiclo.value = "Todos";
        syncSelectors('bar');
    }

    document.getElementById("filterFechaDesde").value = desde;
    document.getElementById("filterFechaHasta").value = hasta;
    applyFilters();
}

function getCultivoForTx(item) {
    if (!item) return "N/A";
    
    const directCultivo = String(
        item.Cultivo_Semilla || item.cultivo_semilla || 
        item.Cultivo || item.cultivo || 
        item.Producto_Vendido || item.producto_vendido || ""
    ).trim();

    if (directCultivo) return directCultivo;

    if (!rawData) return "N/A";
    const lote = String(item.Lote || item.lote || "").trim();
    
    const trackingCode = String(item.Codigo_General || item.codigo_general || item.Codigo_Seguimiento || item.codigo_seguimiento || "").trim().toUpperCase();
    if (trackingCode && rawData.ciclos) {
        const cycle = (rawData.ciclos || []).find(c => 
            String(c.Codigo_General || c.codigo_general || "").trim().toUpperCase() === trackingCode ||
            String(c.Codigo_Inicial || c.codigo_inicial || "").trim().toUpperCase() === trackingCode ||
            String(c.Codigo_Desarrollo || c.codigo_desarrollo || "").trim().toUpperCase() === trackingCode ||
            String(c.Codigo_Ventas || c.codigo_ventas || "").trim().toUpperCase() === trackingCode
        );
        if (cycle) return String(cycle.Cultivo || cycle.cultivo || "").trim();
    }
    
    if (rawData.gastosIniciales) {
        const ini = (rawData.gastosIniciales || []).find(x => isLoteMatch(x.Lote || x.lote, lote));
        if (ini) return String(ini.Cultivo_Semilla || ini.cultivo_semilla || "").trim();
    }
    return "N/A";
}

function applyFilters() {
    if (!rawData) return;
    
    const selectedLote = document.getElementById("filterLote") ? document.getElementById("filterLote").value : (document.getElementById("loteSelector") ? document.getElementById("loteSelector").value : "Todos");
    const selectedCultivo = document.getElementById("filterCultivo") ? document.getElementById("filterCultivo").value : "Todos";
    const selectedCiclo = document.getElementById("filterCiclo") ? document.getElementById("filterCiclo").value : "Todos";
    const fechaDesde = document.getElementById("filterFechaDesde") ? document.getElementById("filterFechaDesde").value : "";
    const fechaHasta = document.getElementById("filterFechaHasta") ? document.getElementById("filterFechaHasta").value : "";

    const isDateInRange = (dateStr) => {
        if (!dateStr || dateStr === "-") return true;
        const d = dateStr.trim();
        if (fechaDesde && d < fechaDesde) return false;
        if (fechaHasta && d > fechaHasta) return false;
        return true;
    };

    const checkLoteMatch = (loteStr) => {
        return isLoteMatch(loteStr, selectedLote);
    };

    const isCicloMatch = (item) => {
        if (!selectedCiclo || selectedCiclo === "Todos") return true;
        const code = String(item.Codigo_Seguimiento || item.codigo_seguimiento || item.Codigo_General || item.codigo_general || "").trim().toUpperCase();
        return code === selectedCiclo.trim().toUpperCase();
    };

    const isCultivoMatch = (item) => {
        if (selectedCultivo === "Todos") return true;
        const c = getCultivoForTx(item);
        return c.toLowerCase().indexOf(selectedCultivo.toLowerCase()) !== -1;
    };

    const gInicialesFiltrados = (rawData.gastosIniciales || []).filter(item => {
        return checkLoteMatch(item.Lote || item.lote) && 
               isCicloMatch(item) &&
               isDateInRange(item.Fecha || item.fecha) && 
               isCultivoMatch(item);
    });

    const gDesarrolloFiltrados = (rawData.gastosDesarrollo || []).filter(item => {
        return checkLoteMatch(item.Lote || item.lote) && 
               isCicloMatch(item) &&
               isDateInRange(item.Fecha || item.fecha) && 
               isCultivoMatch(item);
    });

    const ventasFiltradas = (rawData.ventas || []).filter(item => {
        return checkLoteMatch(item.Lote || item.lote) && 
               isCicloMatch(item) &&
               isDateInRange(item.Fecha || item.fecha) && 
               isCultivoMatch(item);
    });

    const counterInicialesEl = document.getElementById("counterIniciales");
    if (counterInicialesEl) {
        counterInicialesEl.textContent = `${gInicialesFiltrados.length} registros (Total en el filtro)`;
    }

    const counterDesarrolloEl = document.getElementById("counterDesarrollo");
    if (counterDesarrolloEl) {
        counterDesarrolloEl.textContent = `${gDesarrolloFiltrados.length} registros (Total en el filtro)`;
    }

    const counterVentasEl = document.getElementById("counterVentas");
    if (counterVentasEl) {
        counterVentasEl.textContent = `${ventasFiltradas.length} registros (Total en el filtro)`;
    }

    const totalGastosIniciales = gInicialesFiltrados.reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);
    const totalGastosDesarrollo = gDesarrolloFiltrados.reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);
    const totalVentas = ventasFiltradas.reduce((sum, item) => sum + (Number(item.Ingreso_Total_COP || item.ingreso_total_cop) || 0), 0);
    const totalUnidades = ventasFiltradas.reduce((sum, item) => sum + (Number(item.Unidades_Cosechadas || item.unidades_cosechadas) || 0), 0);
    
    const gastosTotales = totalGastosIniciales + totalGastosDesarrollo;
    const utilidadNeta = totalVentas - gastosTotales;
    
    let roiPorcentaje = 0;
    if (gastosTotales > 0) {
        roiPorcentaje = (utilidadNeta / gastosTotales) * 100;
    }

    const costoUnitario = totalUnidades > 0 ? (gastosTotales / totalUnidades) : 0;
    const precioVentaPromedio = totalUnidades > 0 ? (totalVentas / totalUnidades) : 0;
    const deudaTotalActiva = (rawData.prestamos || []).reduce((sum, item) => sum + (Number(item.Saldo_Por_Pagar || item.saldo_por_pagar) || 0), 0);

    const kpiUtilidadNetaEl = document.getElementById("kpiUtilidadNeta");
    if (kpiUtilidadNetaEl) kpiUtilidadNetaEl.textContent = formatCOP(utilidadNeta);
    
    const iconContainer = document.getElementById("kpiUtilidadIconContainer");
    if (iconContainer) {
        if (utilidadNeta >= 0) {
            iconContainer.className = "p-2.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-xl";
        } else {
            iconContainer.className = "p-2.5 bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-xl";
        }
    }

    updateLoteSummaryMetrics(selectedLote, gastosTotales, totalUnidades, precioVentaPromedio);

    const kpiRoiEl = document.getElementById("kpiRoi");
    if (kpiRoiEl) {
        kpiRoiEl.textContent = `${roiPorcentaje.toFixed(1)}%`;
        if (roiPorcentaje >= 0) {
            kpiRoiEl.className = "text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1";
        } else {
            kpiRoiEl.className = "text-xl sm:text-2xl font-extrabold text-rose-600 mt-1";
        }
    }

    const kpiPasivosEl = document.getElementById("kpiPasivos");
    if (kpiPasivosEl) {
        kpiPasivosEl.textContent = formatCOP(deudaTotalActiva);
    }

    const kpiInversionVsVentasEl = document.getElementById("kpiInversionVsVentas");
    if (kpiInversionVsVentasEl) {
        kpiInversionVsVentasEl.textContent = `${formatCOP(gastosTotales)} vs ${formatCOP(totalVentas)}`;
    }

    const plVentasEl = document.getElementById("plVentas");
    if (plVentasEl) plVentasEl.textContent = formatCOP(totalVentas);
    const plCostosInicialesEl = document.getElementById("plCostosIniciales");
    if (plCostosInicialesEl) plCostosInicialesEl.textContent = formatCOP(totalGastosIniciales);
    const plCostosDesarrolloEl = document.getElementById("plCostosDesarrollo");
    if (plCostosDesarrolloEl) plCostosDesarrolloEl.textContent = formatCOP(totalGastosDesarrollo);
    const plUtilidadEl = document.getElementById("plUtilidad");
    if (plUtilidadEl) plUtilidadEl.textContent = formatCOP(utilidadNeta);

    renderLotesTable(selectedLote);
    renderCharts(selectedLote);
    renderPrestamos();
    renderTransaccionesTable(selectedLote);
    renderCashflowModule();
    renderCuentasPendientes();

    if (currentUserRole === 'view') {
        applyViewOnlyPermissions();
    }
}

function renderLotesTable(selectedLote) {
    const tableBody = document.getElementById("resumenLotesTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const selectedCultivo = document.getElementById("filterCultivo") ? document.getElementById("filterCultivo").value : "Todos";
    const selectedCiclo = document.getElementById("filterCiclo") ? document.getElementById("filterCiclo").value : "Todos";
    const fechaDesde = document.getElementById("filterFechaDesde") ? document.getElementById("filterFechaDesde").value : "";
    const fechaHasta = document.getElementById("filterFechaHasta") ? document.getElementById("filterFechaHasta").value : "";

    const isDateInRange = (dateStr) => {
        if (!dateStr || dateStr === "-") return true;
        const d = dateStr.trim();
        if (fechaDesde && d < fechaDesde) return false;
        if (fechaHasta && d > fechaHasta) return false;
        return true;
    };

    const isCicloMatch = (item) => {
        if (!selectedCiclo || selectedCiclo === "Todos") return true;
        const code = String(item.Codigo_Seguimiento || item.codigo_seguimiento || item.Codigo_General || item.codigo_general || "").trim().toUpperCase();
        return code === selectedCiclo.trim().toUpperCase();
    };

    const isCultivoMatch = (item) => {
        if (selectedCultivo === "Todos") return true;
        const c = getCultivoForTx(item);
        return c.toLowerCase().indexOf(selectedCultivo.toLowerCase()) !== -1;
    };

    let lotesAProcesar = [];
    if (selectedLote === "Todos") {
        for (let i = 1; i <= 16; i++) lotesAProcesar.push(`Lote ${i}`);
    } else {
        lotesAProcesar.push(selectedLote);
    }

    let renderedCount = 0;

    lotesAProcesar.forEach(lote => {
        const iniRow = (rawData.gastosIniciales || []).find(item => isLoteMatch(item.Lote || item.lote, lote));
        const cultivo = iniRow ? (iniRow.Cultivo_Semilla || iniRow.cultivo_semilla || "Por Definir") : "Sin Registrar";

        const gIniTotal = (rawData.gastosIniciales || [])
            .filter(item => isLoteMatch(item.Lote || item.lote, lote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item))
            .reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);

        const gDesTotal = (rawData.gastosDesarrollo || [])
            .filter(item => isLoteMatch(item.Lote || item.lote, lote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item))
            .reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);

        const costoTotal = gIniTotal + gDesTotal;
        
        const filteredVentas = (rawData.ventas || [])
            .filter(item => isLoteMatch(item.Lote || item.lote, lote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item));

        const ventasTotal = filteredVentas.reduce((sum, item) => sum + (Number(item.Ingreso_Total_COP || item.ingreso_total_cop) || 0), 0);
        const unidadesTotal = filteredVentas.reduce((sum, item) => sum + (Number(item.Unidades_Cosechadas || item.unidades_cosechadas) || 0), 0);

        const ganancia = ventasTotal - costoTotal;
        
        let roi = 0;
        if (costoTotal > 0) {
            roi = (ganancia / costoTotal) * 100;
        }

        const costoUnitario = unidadesTotal > 0 ? (costoTotal / unidadesTotal) : 0;
        const precioVentaPromedio = unidadesTotal > 0 ? (ventasTotal / unidadesTotal) : 0;

        if ((fechaDesde || fechaHasta || selectedCultivo !== "Todos") && costoTotal === 0 && ventasTotal === 0) {
            return;
        }

        renderedCount++;

        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition duration-150";
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap font-semibold text-slate-900 dark:text-white">${lote}</td>
            <td class="px-6 py-4 whitespace-nowrap"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">${cultivo}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-slate-600 dark:text-slate-300 font-medium">${formatCOP(costoTotal)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-slate-600 dark:text-slate-300 font-medium">${formatCOP(ventasTotal)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-slate-600 dark:text-slate-300 font-medium">${unidadesTotal}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-slate-600 dark:text-slate-300 font-medium">${unidadesTotal > 0 ? formatCOP(costoUnitario) : "-"}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-slate-600 dark:text-slate-300 font-medium">${unidadesTotal > 0 ? formatCOP(precioVentaPromedio) : "-"}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right font-extrabold ${ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatCOP(ganancia)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right font-bold ${roi >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${roi.toFixed(1)}%</td>
        `;
        tableBody.appendChild(tr);
    });

    const tablaCountEl = document.getElementById("tablaCount"); 
    if (tablaCountEl) tablaCountEl.textContent = `Mostrando ${renderedCount} ${renderedCount === 1 ? 'lote' : 'lotes'}`;
}

let currentDoughnutType = "gastos_desarrollo";

function changeDoughnutType(type) {
    currentDoughnutType = type;
    const titleEl = document.getElementById("doughnutCardTitle");
    const subtitleEl = document.getElementById("doughnutCardSubtitle");
    
    if (type === "consolidado") {
        if (titleEl) titleEl.textContent = "Consolidado General de Módulos";
        if (subtitleEl) subtitleEl.textContent = "Comparativa total acumulada: Gastos Iniciales vs. Gastos de Desarrollo vs. Ventas.";
    } else if (type === "gastos_desarrollo") {
        if (titleEl) titleEl.textContent = "Insumos y Gastos de Desarrollo";
        if (subtitleEl) subtitleEl.textContent = "Distribución de egresos operacionales agrupados por categoría de insumo.";
    } else if (type === "gastos_iniciales") {
        if (titleEl) titleEl.textContent = "Gastos Iniciales";
        if (subtitleEl) subtitleEl.textContent = "Distribución de gastos de establecimiento agrupados por cultivo/semilla.";
    } else if (type === "ventas") {
        if (titleEl) titleEl.textContent = "Distribución de Ventas";
        if (subtitleEl) subtitleEl.textContent = "Distribución de ingresos brutos agrupados por producto vendido.";
    }
    
    const selectedLote = document.getElementById("loteSelector")?.value || "Todos";
    renderCharts(selectedLote);
}

function renderCharts(selectedLote) {
    if (barChartInstance) barChartInstance.destroy();
    if (doughnutChartInstance) doughnutChartInstance.destroy();

    const selectedCultivo = document.getElementById("filterCultivo") ? document.getElementById("filterCultivo").value : "Todos";
    const selectedCiclo = document.getElementById("filterCiclo") ? document.getElementById("filterCiclo").value : "Todos";
    const fechaDesde = document.getElementById("filterFechaDesde") ? document.getElementById("filterFechaDesde").value : "";
    const fechaHasta = document.getElementById("filterFechaHasta") ? document.getElementById("filterFechaHasta").value : "";

    const isDateInRange = (dateStr) => {
        if (!dateStr || dateStr === "-") return true;
        const d = dateStr.trim();
        if (fechaDesde && d < fechaDesde) return false;
        if (fechaHasta && d > fechaHasta) return false;
        return true;
    };

    const isCicloMatch = (item) => {
        if (!selectedCiclo || selectedCiclo === "Todos") return true;
        const code = String(item.Codigo_Seguimiento || item.codigo_seguimiento || item.Codigo_General || item.codigo_general || "").trim().toUpperCase();
        return code === selectedCiclo.trim().toUpperCase();
    };

    const isCultivoMatch = (item) => {
        if (selectedCultivo === "Todos") return true;
        const c = getCultivoForTx(item);
        return c.toLowerCase().indexOf(selectedCultivo.toLowerCase()) !== -1;
    };

    let lotes = [];
    if (selectedLote === "Todos") {
        for (let i = 1; i <= 16; i++) lotes.push(`Lote ${i}`);
    } else {
        lotes.push(selectedLote);
    }

    const datasetCostos = [];
    const datasetVentas = [];
    const activeLotes = [];

    lotes.forEach(lote => {
        const gIni = (rawData.gastosIniciales || [])
            .filter(item => isLoteMatch(item.Lote || item.lote, lote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item))
            .reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);

        const gDes = (rawData.gastosDesarrollo || [])
            .filter(item => isLoteMatch(item.Lote || item.lote, lote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item))
            .reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);

        const v = (rawData.ventas || [])
            .filter(item => isLoteMatch(item.Lote || item.lote, lote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item))
            .reduce((sum, item) => sum + (Number(item.Ingreso_Total_COP || item.ingreso_total_cop) || 0), 0);

        if ((fechaDesde || fechaHasta || selectedCultivo !== "Todos") && gIni === 0 && gDes === 0 && v === 0) {
            return;
        }

        activeLotes.push(lote);
        datasetCostos.push(gIni + gDes);
        datasetVentas.push(v);
    });

    const ctxBar = document.getElementById('barChart').getContext('2d');
    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: activeLotes,
            datasets: [
                {
                    label: 'Costo Total Acumulado',
                    data: datasetCostos,
                    backgroundColor: 'rgba(239, 68, 68, 0.85)',
                    borderColor: 'rgb(239, 68, 68)',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Ingreso Ventas',
                    data: datasetVentas,
                    backgroundColor: 'rgba(16, 185, 129, 0.85)',
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCOP(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Plus Jakarta Sans', size: 10, weight: '500' } }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        callback: function(value) {
                            if (value >= 1e6) return '$' + (value / 1e6) + 'M';
                            return formatCOP(value);
                        }
                    }
                }
            }
        }
    });

    const desgloseInsumos = {};
    let noDataText = "Sin gastos de desarrollo registrados";

    if (currentDoughnutType === "consolidado") {
        noDataText = "Sin datos consolidados para el filtro seleccionado";
        const fIni = (rawData.gastosIniciales || []).filter(item => isLoteMatch(String(item.Lote || item.lote).trim(), selectedLote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item));
        const fDes = (rawData.gastosDesarrollo || []).filter(item => isLoteMatch(String(item.Lote || item.lote).trim(), selectedLote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item));
        const fVen = (rawData.ventas || []).filter(item => isLoteMatch(String(item.Lote || item.lote).trim(), selectedLote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item));

        const totIni = fIni.reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);
        const totDes = fDes.reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);
        const totVen = fVen.reduce((sum, item) => sum + (Number(item.Ingreso_Total_COP || item.ingreso_total_cop) || 0), 0);

        if (totIni > 0) desgloseInsumos["Gastos Iniciales"] = totIni;
        if (totDes > 0) desgloseInsumos["Gastos de Desarrollo"] = totDes;
        if (totVen > 0) desgloseInsumos["Total Ventas"] = totVen;
    } else if (currentDoughnutType === "gastos_desarrollo") {
        noDataText = "Sin gastos de desarrollo registrados";
        const filtrados = (rawData.gastosDesarrollo || []).filter(item => {
            const itemLote = String(item.Lote || item.lote).trim();
            return isLoteMatch(itemLote, selectedLote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item);
        });
        filtrados.forEach(item => {
            const tipo = String(item.Tipo_Insumo || item.tipo_insumo || "Otros").trim();
            const costo = Number(item.Costo_Total_COP || item.costo_total_cop) || 0;
            desgloseInsumos[tipo] = (desgloseInsumos[tipo] || 0) + costo;
        });
    } else if (currentDoughnutType === "gastos_iniciales") {
        noDataText = "Sin gastos iniciales registrados";
        const filtrados = (rawData.gastosIniciales || []).filter(item => {
            const itemLote = String(item.Lote || item.lote).trim();
            return isLoteMatch(itemLote, selectedLote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item);
        });
        filtrados.forEach(item => {
            const tipo = String(item.Cultivo_Semilla || item.cultivo_semilla || "Por Definir").trim();
            const costo = Number(item.Costo_Total_COP || item.costo_total_cop) || 0;
            desgloseInsumos[tipo] = (desgloseInsumos[tipo] || 0) + costo;
        });
    } else if (currentDoughnutType === "ventas") {
        noDataText = "Sin ventas registradas";
        const filtrados = (rawData.ventas || []).filter(item => {
            const itemLote = String(item.Lote || item.lote).trim();
            return isLoteMatch(itemLote, selectedLote) && isCicloMatch(item) && isDateInRange(item.Fecha || item.fecha) && isCultivoMatch(item);
        });
        filtrados.forEach(item => {
            const tipo = String(item.Producto_Vendido || item.producto_vendido || "Otros").trim();
            const ingreso = Number(item.Ingreso_Total_COP || item.ingreso_total_cop) || 0;
            desgloseInsumos[tipo] = (desgloseInsumos[tipo] || 0) + ingreso;
        });
    }

    const labelsDona = Object.keys(desgloseInsumos);
    const dataDona = Object.values(desgloseInsumos);
    const colorsDona = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280', '#06b6d4', '#f97316'];

    const ctxDona = document.getElementById('doughnutChart').getContext('2d');
    if (dataDona.length === 0) {
        ctxDona.clearRect(0, 0, 300, 300);
        ctxDona.font = "14px 'Plus Jakarta Sans'";
        ctxDona.fillStyle = "#94a3b8";
        ctxDona.textAlign = "center";
        ctxDona.fillText(noDataText, 150, 150);
    } else {
        doughnutChartInstance = new Chart(ctxDona, {
            type: 'doughnut',
            data: {
                labels: labelsDona,
                datasets: [{
                    data: dataDona,
                    backgroundColor: colorsDona.slice(0, labelsDona.length),
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { family: 'Plus Jakarta Sans', size: 10, weight: '500' },
                            boxWidth: 10
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const value = context.raw;
                                const percentage = Math.round((value / total) * 100);
                                return `${context.label}: ${formatCOP(value)} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
}

function renderPrestamos() {
    if (!rawData || !rawData.prestamos) return;
    const tableBody = document.getElementById("prestamosTableBody");
    tableBody.innerHTML = "";

    let totalPrestado = 0;
    let totalPagado = 0;
    let totalSaldo = 0;

    (rawData.prestamos || []).forEach(item => {
        const banco = item.Entidad_Banco || item.entidad_banco || "Sin Registrar";
        const tipo = item.Tipo_Prestamo || item.tipo_prestamo || "Crédito General";
        const valorPrestado = Number(item.Valor_Prestado || item.valor_prestado) || 0;
        const pagoCuotas = Number(item.Pago_Cuotas || item.pago_cuotas) || 0;
        const saldoPagar = Number(item.Saldo_Por_Pagar || item.saldo_por_pagar || (valorPrestado - pagoCuotas)) || 0;
        const notas = item.Notas || item.notas || "-";

        totalPrestado += valorPrestado;
        totalPagado += pagoCuotas;
        totalSaldo += saldoPagar;

        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/70 transition duration-150";
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap font-semibold text-slate-900">${banco}</td>
            <td class="px-6 py-4 whitespace-nowrap"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-800">${tipo}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-right font-medium text-slate-700">${formatCOP(valorPrestado)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right font-medium text-slate-700">${formatCOP(pagoCuotas)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right font-bold text-rose-600">${formatCOP(saldoPagar)}</td>
            <td class="px-6 py-4 text-xs text-slate-500 max-w-xs truncate" title="${notas}">${notas}</td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById("kpiTotalPrestado").textContent = formatCOP(totalPrestado);
    document.getElementById("kpiTotalPagado").textContent = formatCOP(totalPagado);
    document.getElementById("kpiTotalSaldo").textContent = formatCOP(totalSaldo);
}

function renderCashflowModule() {
    if (!rawData) return;

    const selectedLote = document.getElementById("cashflowLoteSelector")?.value || "Todos";

    const filterByLote = (item) => {
        return isLoteMatch(item.Lote || item.lote, selectedLote);
    };

    const filteredVentas = (rawData.ventas || []).filter(filterByLote);
    const filteredIniciales = (rawData.gastosIniciales || []).filter(filterByLote);
    const filteredDesarrollo = (rawData.gastosDesarrollo || []).filter(filterByLote);

    const cajaReal = filteredVentas
        .filter(x => String(x.Estado_Pago || x.estado_pago || 'PAGADO').toUpperCase() === 'PAGADO')
        .reduce((sum, x) => sum + (Number(x.Ingreso_Total_COP || x.ingreso_total_cop) || 0), 0);

    const salidaReal = filteredIniciales.concat(filteredDesarrollo)
        .filter(x => String(x.Estado_Pago || x.estado_pago || 'PAGADO').toUpperCase() === 'PAGADO')
        .reduce((sum, x) => sum + (Number(x.Costo_Total_COP || x.costo_total_cop) || 0), 0);

    const saldoDisponible = cajaReal - salidaReal;

    const cuentasPorCobrar = filteredVentas
        .filter(x => String(x.Estado_Pago || x.estado_pago || '').toUpperCase() === 'PENDIENTE')
        .reduce((sum, x) => sum + (Number(x.Ingreso_Total_COP || x.ingreso_total_cop) || 0), 0);

    const cuentasPorPagar = filteredIniciales.concat(filteredDesarrollo)
        .filter(x => String(x.Estado_Pago || x.estado_pago || '').toUpperCase() === 'PENDIENTE')
        .reduce((sum, x) => sum + (Number(x.Costo_Total_COP || x.costo_total_cop) || 0), 0);

    const saldoProyectado = (cajaReal + cuentasPorCobrar) - cuentasPorPagar;

    const cfEfectivoIngresadoEl = document.getElementById("cfEfectivoIngresado");
    if (cfEfectivoIngresadoEl) cfEfectivoIngresadoEl.textContent = formatCOP(cajaReal);

    const cfEfectivoGastadoEl = document.getElementById("cfEfectivoGastado");
    if (cfEfectivoGastadoEl) cfEfectivoGastadoEl.textContent = formatCOP(salidaReal);

    const cfSaldoDisponibleEl = document.getElementById("cfSaldoDisponible");
    if (cfSaldoDisponibleEl) cfSaldoDisponibleEl.textContent = formatCOP(saldoDisponible);

    const cfSaldoProyectadoEl = document.getElementById("cfSaldoProyectado");
    if (cfSaldoProyectadoEl) cfSaldoProyectadoEl.textContent = formatCOP(saldoProyectado);
}

function renderCuentasPendientes() {
    if (!rawData) return;

    const tableBody = document.getElementById("cuentasPendientesTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    let countVencidas = 0;
    let valVencidas = 0;
    let countPorCobrar = 0;
    let valPorCobrar = 0;
    let countPorPagar = 0;
    let valPorPagar = 0;

    const todayStr = new Date().toISOString().split('T')[0];
    let pendingItems = [];

    (rawData.ventas || []).forEach((v, idx) => {
        const estado = String(v.Estado_Pago || v.estado_pago || '').toUpperCase();
        if (estado === 'PENDIENTE') {
            const monto = Number(v.Ingreso_Total_COP || v.ingreso_total_cop) || 0;
            const venc = String(v.Fecha_Vencimiento || v.fecha_vencimiento || '').trim();
            const isVencida = venc && venc < todayStr;

            countPorCobrar++;
            valPorCobrar += monto;

            if (isVencida) {
                countVencidas++;
                valVencidas += monto;
            }

            pendingItems.push({
                tipo: 'venta',
                tipoText: 'Cobro (Venta)',
                lote: v.Lote || v.lote || '-',
                tercero: v.Cliente_Deudor_Proveedor || v.cliente_deudor_proveedor || v.Comprador || v.comprador || 'Cliente Varios',
                concepto: v.Producto_Vendido || v.producto_vendido || 'Venta de Cosecha',
                monto: monto,
                vencimiento: venc || '-',
                isVencida: isVencida,
                code: v.Codigo_Seguimiento || v.codigo_seguimiento || (idx + 2)
            });
        }
    });

    (rawData.gastosIniciales || []).forEach((ini, idx) => {
        const estado = String(ini.Estado_Pago || ini.estado_pago || '').toUpperCase();
        if (estado === 'PENDIENTE') {
            const monto = Number(ini.Costo_Total_COP || ini.costo_total_cop) || 0;
            const venc = String(ini.Fecha_Vencimiento || ini.fecha_vencimiento || '').trim();

            countPorPagar++;
            valPorPagar += monto;

            pendingItems.push({
                tipo: 'gastosIniciales',
                tipoText: 'Pago (Gasto Inicial)',
                lote: ini.Lote || ini.lote || '-',
                tercero: ini.Cliente_Deudor_Proveedor || ini.cliente_deudor_proveedor || 'Proveedor Varios',
                concepto: ini.Cultivo_Semilla || ini.cultivo_semilla || 'Establecimiento',
                monto: monto,
                vencimiento: venc || '-',
                isVencida: venc && venc < todayStr,
                code: ini.Codigo_Seguimiento || ini.codigo_seguimiento || (idx + 2)
            });
        }
    });

    (rawData.gastosDesarrollo || []).forEach((des, idx) => {
        const estado = String(des.Estado_Pago || des.estado_pago || '').toUpperCase();
        if (estado === 'PENDIENTE') {
            const monto = Number(des.Costo_Total_COP || des.costo_total_cop) || 0;
            const venc = String(des.Fecha_Vencimiento || des.fecha_vencimiento || '').trim();

            countPorPagar++;
            valPorPagar += monto;

            pendingItems.push({
                tipo: 'gastosDesarrollo',
                tipoText: 'Pago (Gasto Desarrollo)',
                lote: des.Lote || des.lote || '-',
                tercero: des.Cliente_Deudor_Proveedor || des.cliente_deudor_proveedor || 'Proveedor/Trabajador',
                concepto: des.Tipo_Insumo || des.tipo_insumo || 'Mantenimiento',
                monto: monto,
                vencimiento: venc || '-',
                isVencida: venc && venc < todayStr,
                code: des.Codigo_Seguimiento || des.codigo_seguimiento || (idx + 2)
            });
        }
    });

    const countCobrarVencidasEl = document.getElementById("countCobrarVencidas");
    if (countCobrarVencidasEl) countCobrarVencidasEl.textContent = countVencidas;
    const valCobrarVencidasEl = document.getElementById("valCobrarVencidas");
    if (valCobrarVencidasEl) valCobrarVencidasEl.textContent = formatCOP(valVencidas);

    const countPorCobrarEl = document.getElementById("countPorCobrar");
    if (countPorCobrarEl) countPorCobrarEl.textContent = countPorCobrar;
    const valPorCobrarEl = document.getElementById("valPorCobrar");
    if (valPorCobrarEl) valPorCobrarEl.textContent = formatCOP(valPorCobrar);

    const countPorPagarEl = document.getElementById("countPorPagar");
    if (countPorPagarEl) countPorPagarEl.textContent = countPorPagar;
    const valPorPagarEl = document.getElementById("valPorPagar");
    if (valPorPagarEl) valPorPagarEl.textContent = formatCOP(valPorPagar);

    const totalPending = countPorCobrar + countPorPagar;
    const pendingAlertsBadgeEl = document.getElementById("pendingAlertsBadge");
    if (pendingAlertsBadgeEl) pendingAlertsBadgeEl.textContent = `${totalPending} Pendientes`;

    if (pendingItems.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-6 text-center text-xs text-slate-400 font-semibold italic">
                    ¡Sin cuentas pendientes! Todas las transacciones registradas están al día y pagadas.
                </td>
            </tr>
        `;
        return;
    }

    pendingItems.sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'));

    pendingItems.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition duration-150";

        const isVenta = item.tipo === 'venta';
        const badgeClass = isVenta ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-orange-100 text-orange-800 border-orange-200';
        
        let stateBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200">Pendiente</span>`;
        if (item.isVencida) {
            stateBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-200">Vencida</span>`;
        }

        tr.innerHTML = `
            <td class="px-6 py-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${badgeClass}">${item.tipoText}</span></td>
            <td class="px-6 py-3 whitespace-nowrap text-xs font-bold text-slate-900 dark:text-white">${item.lote}</td>
            <td class="px-6 py-3 whitespace-nowrap text-xs font-semibold text-slate-800 dark:text-slate-200">${item.tercero}</td>
            <td class="px-6 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">${item.concepto}</td>
            <td class="px-6 py-3 whitespace-nowrap text-xs text-right font-extrabold ${isVenta ? 'text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400'}">${formatCOP(item.monto)}</td>
            <td class="px-6 py-3 whitespace-nowrap text-xs text-center font-mono font-medium ${item.isVencida ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500'}">${item.vencimiento}</td>
            <td class="px-6 py-3 whitespace-nowrap text-center">${stateBadge}</td>
            <td class="px-6 py-3 whitespace-nowrap text-center">
                <button type="button" onclick="marcarComoPagado('${item.tipo}', '${item.code}')" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition cursor-pointer">
                    Marcar como Pagado
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function marcarComoPagado(tipoTabla, filaCodeOrId) {
    if (!confirm("¿Confirmas que deseas marcar esta cuenta pendiente como PAGADA?")) return;

    showLoader(true);
    const fechaHoy = new Date().toISOString().split('T')[0];

    const updateArrayLocally = (arr) => {
        if (!arr) return;
        const match = arr.find(x => 
            String(x.Codigo_Seguimiento || x.codigo_seguimiento || '').toUpperCase() === String(filaCodeOrId).toUpperCase() ||
            String(x.Codigo_General || x.codigo_general || '').toUpperCase() === String(filaCodeOrId).toUpperCase()
        );
        if (match) {
            match.Estado_Pago = 'PAGADO';
            match.estado_pago = 'PAGADO';
            match.Fecha_Pago_Realizado = fechaHoy;
        }
    };

    if (tipoTabla === 'venta' || tipoTabla === 'ventas') updateArrayLocally(rawData.ventas);
    if (tipoTabla === 'gastosIniciales') updateArrayLocally(rawData.gastosIniciales);
    if (tipoTabla === 'gastosDesarrollo') updateArrayLocally(rawData.gastosDesarrollo);

    if (typeof google === 'undefined' || !google.script || !google.script.run) {
        setTimeout(() => {
            showLoader(false);
            applyFilters();
            alert("¡Cuenta actualizada como PAGADA exitosamente!");
        }, 600);
    } else {
        google.script.run
            .withSuccessHandler(function(res) {
                showLoader(false);
                applyFilters();
                alert("¡Estado de pago actualizado exitosamente en Google Sheets!");
            })
            .withFailureHandler(function(err) {
                showLoader(false);
                alert("Error actualizando en Google Sheets: " + err.toString());
            })
            .actualizarEstadoPago(tipoTabla, filaCodeOrId, 'PAGADO', fechaHoy);
    }
}

function handleDataLoaded(data) {
    rawData = data || {};
    if (!rawData.gastosIniciales) rawData.gastosIniciales = [];
    if (!rawData.gastosDesarrollo) rawData.gastosDesarrollo = [];
    if (!rawData.ventas) rawData.ventas = [];
    if (!rawData.configuracion) rawData.configuracion = [];
    if (!rawData.prestamos) rawData.prestamos = [];
    if (!rawData.ciclos) rawData.ciclos = [];
    if (!rawData.gastosPersonales) rawData.gastosPersonales = [];
    if (!rawData.fotosLotes) rawData.fotosLotes = [];
    if (!rawData.ingresosExternos) rawData.ingresosExternos = [];
    if (!rawData.metasRecoleccion) rawData.metasRecoleccion = [];
    if (!rawData.aportesMetas) rawData.aportesMetas = [];
    updateConfigHeader();
    applyFilters();
    showLoader(false);
}

function showLoader(show, message) {
    var loader = document.getElementById("loader");
    if (loader) {
        if (show) {
            loader.classList.remove("hidden");
            loader.style.display = "flex";
        } else {
            loader.classList.add("hidden");
            loader.style.display = "none";
        }
    }
    var msgEl = document.getElementById("loaderMessage");
    if (message && msgEl) {
        msgEl.textContent = message;
    }
}

function hideLoader() {
    var loader = document.getElementById("loader");
    if (loader) {
        loader.style.display = "none";
    }
}

function showError(msg) {
    var errText = document.getElementById("errorMessage");
    if (errText) {
        errText.textContent = msg;
    }
    var errAlert = document.getElementById("errorAlert");
    if (errAlert) {
        errAlert.classList.remove("hidden");
    }
    hideLoader();
}

function hideError() {
    var errAlert = document.getElementById("errorAlert");
    if (errAlert) {
        errAlert.classList.add("hidden");
    }
}

let currentView = 'dashboard';

function toggleMobileMenu() {
    const drawer = document.getElementById("mobileMenuDrawer");
    if (drawer) {
        if (drawer.classList.contains("hidden")) {
            drawer.classList.remove("hidden");
        } else {
            drawer.classList.add("hidden");
        }
    }
}

window.showView = showView;

function showView(viewName) {
    currentView = viewName;
    
    const drawer = document.getElementById("mobileMenuDrawer");
    if (drawer && !drawer.classList.contains("hidden")) {
        drawer.classList.add("hidden");
    }

    const dashboardView = document.getElementById("dashboardView");
    const dataEntryView = document.getElementById("dataEntryView");
    const estadoResultadosView = document.getElementById("estadoResultadosView");
    const obligacionesFormView = document.getElementById("obligacionesFormView");
    const cajaGeneralView = document.getElementById("cajaGeneralView");
    const mapaLotesView = document.getElementById("mapaLotesView");
    
    const navButtons = document.querySelectorAll(".module-nav-btn");
    const volverDashboardBtn = document.getElementById("volverDashboardBtn");
    const loteSelector = document.getElementById("loteSelector");
    
    if (dashboardView) dashboardView.classList.add("hidden");
    if (dataEntryView) dataEntryView.classList.add("hidden");
    if (estadoResultadosView) estadoResultadosView.classList.add("hidden");
    if (obligacionesFormView) obligacionesFormView.classList.add("hidden");
    if (cajaGeneralView) cajaGeneralView.classList.add("hidden");
    if (mapaLotesView) mapaLotesView.classList.add("hidden");
    
    if (loteSelector) loteSelector.disabled = false;
    
    if (viewName === 'dashboard') {
        navButtons.forEach(btn => btn.classList.remove("hidden"));
        if (volverDashboardBtn) volverDashboardBtn.classList.add("hidden");
        if (dashboardView) dashboardView.classList.remove("hidden");
        applyFilters();
    } else {
        navButtons.forEach(btn => btn.classList.remove("hidden"));
        if (volverDashboardBtn) volverDashboardBtn.classList.remove("hidden");

        if (viewName === 'data_entry') {
            if (dataEntryView) dataEntryView.classList.remove("hidden");
            if (loteSelector) loteSelector.disabled = true;

            populateDropdowns();

            const posLoteSelect = document.getElementById("posLotePrincipal");
            const filterLoteSelect = document.getElementById("filterLote");
            const filterCultivoSelect = document.getElementById("filterCultivo");
            const headerLoteSelect = document.getElementById("loteSelector");

            if (posLoteSelect) {
                let selectedVal = "";
                if (filterLoteSelect && filterLoteSelect.value && filterLoteSelect.value !== "Todos") {
                    selectedVal = filterLoteSelect.value;
                } else if (headerLoteSelect && headerLoteSelect.value && headerLoteSelect.value !== "Todos") {
                    selectedVal = headerLoteSelect.value;
                } else {
                    selectedVal = "Lote 1";
                }
                posLoteSelect.value = selectedVal;
                handlePOSLotePrincipalChange();
            }

            if (filterCultivoSelect && filterCultivoSelect.value && filterCultivoSelect.value !== "Todos") {
                const posCultivoSelect = document.getElementById("posCultivo");
                if (posCultivoSelect && [...posCultivoSelect.options].some(o => o.value === filterCultivoSelect.value)) {
                    posCultivoSelect.value = filterCultivoSelect.value;
                }
            }

            const fechaInput = document.getElementById("posFecha");
            if (fechaInput && !fechaInput.value) {
                fechaInput.value = new Date().toISOString().split('T')[0];
            }
        } else if (viewName === 'estado_resultados') {
            if (estadoResultadosView) {
                estadoResultadosView.classList.remove("hidden");
                renderEstadoResultados();
            }
        } else if (viewName === 'obligaciones') {
            if (obligacionesFormView) obligacionesFormView.classList.remove("hidden");
            if (loteSelector) loteSelector.disabled = true;
        } else if (viewName === 'caja_general') {
            if (cajaGeneralView) {
                cajaGeneralView.classList.remove("hidden");
                renderCajaGeneralModule();
            }
        } else if (viewName === 'mapa_lotes') {
            if (mapaLotesView) {
                mapaLotesView.classList.remove("hidden");
                renderInteractiveMap();
                renderPhotoGallery();
            }
        }
    }

    if (currentUserRole === 'view') {
        applyViewOnlyPermissions();
    }
}

function toggleView() {
    if (currentView === 'dashboard') {
        showView('data_entry');
    } else {
        showView('dashboard');
    }
}

let activePOSTab = 'gastos_iniciales';

function isProrrateoInsumoSelected() {
    if (typeof activePOSTab === 'undefined' || activePOSTab !== 'gastos_desarrollo') return false;
    const insumoEl = document.getElementById("posInsumo");
    const val = insumoEl ? insumoEl.value : "";
    return val === "Fertilizantes" || val === "Pesticidas";
}

function handlePOSInsumoChange() {
    const isProrrateo = isProrrateoInsumoSelected();
    const loteSelect = document.getElementById("posLotePrincipal");
    const noticeEl = document.getElementById("posGeneralInsumosNotice");

    if (loteSelect) {
        if (isProrrateo) {
            loteSelect.disabled = true;
            loteSelect.classList.add("bg-slate-100", "text-slate-500", "cursor-not-allowed");
            loteSelect.removeAttribute("required");
        } else {
            loteSelect.disabled = false;
            loteSelect.classList.remove("bg-slate-100", "text-slate-500", "cursor-not-allowed");
            loteSelect.setAttribute("required", "required");
        }
    }

    if (noticeEl) {
        if (isProrrateo) {
            noticeEl.classList.remove("hidden");
        } else {
            noticeEl.classList.add("hidden");
        }
    }

    checkPOSLoteSelection();
}

window.handlePOSInsumoChange = handlePOSInsumoChange;
window.handlePOSLotePrincipalChange = handlePOSLotePrincipalChange;
window.switchPOSTab = switchPOSTab;
window.checkPOSLoteSelection = checkPOSLoteSelection;

function getLocalActiveLotesList() {
    const list = [];
    if (rawData && rawData.ciclos) {
        (rawData.ciclos || []).forEach(c => {
            const st = String(c.Estado || c.estado || '').toUpperCase();
            if (st === 'EN PROCESO' || st === 'ACTIVO') {
                const lp = String(c.Lote_Principal || c.lote_principal || c.Lote || c.lote || '').trim();
                const m = lp.match(/^(Lote\s*\d+)/i);
                const name = m ? m[1] : lp;
                if (name && !list.includes(name)) list.push(name);
            }
        });
    }
    if (list.length === 0) {
        for (let i = 1; i <= 16; i++) list.push(`Lote ${i}`);
    }
    return list;
}

function switchPOSTab(tab) {
    activePOSTab = tab;
    const tabs = ['gastos_iniciales', 'gastos_desarrollo', 'ventas', 'ciclos_lot'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabBtn_${t}`);
        const section = document.getElementById(`section_${t}`);
        
        if (btn) {
            if (t === tab) {
                btn.className = "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition duration-150 ease-in-out cursor-pointer shadow-sm border border-slate-200 bg-emerald-600 text-white";
                if (section) section.classList.remove("hidden");
            } else {
                btn.className = "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition duration-150 ease-in-out cursor-pointer bg-white text-slate-600 hover:bg-slate-100 border border-slate-200";
                if (section) section.classList.add("hidden");
            }
        }
    });
    hidePOSAlert();
    handlePOSInsumoChange();

    if (tab === 'ciclos_lot') {
        updateCyclesTabUI();
    } else {
        const submitBar = document.getElementById("posSubmitButtonsBar");
        if (submitBar) submitBar.classList.remove("hidden");
        autoFillActiveCycleCodes();
    }
}

function updateCyclesTabUI() {
    const lote = document.getElementById("posLote").value;
    const label = document.getElementById("cycleLoteStatusLabel");
    const container = document.getElementById("cycleLoteStateContainer");
    const submitBar = document.getElementById("posSubmitButtonsBar");

    if (submitBar) submitBar.classList.add("hidden");

    if (!lote) {
        if (label) {
            label.textContent = "SIN SELECCIONAR";
            label.className = "px-3 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-wider rounded-full border border-slate-200";
        }
        if (container) {
            container.innerHTML = `
                <div class="text-center py-6 text-slate-400 text-sm">
                    <svg class="h-10 w-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                    Selecciona primero un Lote Destino arriba para ver o gestionar su ciclo.
                </div>
            `;
        }
        return;
    }

    if (!rawData) rawData = {};
    if (!rawData.ciclos) rawData.ciclos = [];
    const activeCycle = (rawData.ciclos || []).find(item => String(item.Lote || item.lote).trim() === lote && String(item.Estado || item.estado).toUpperCase() === 'EN PROCESO');

    if (activeCycle) {
        if (label) {
            label.textContent = "EN PROCESO";
            label.className = "px-3 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold uppercase tracking-wider rounded-full border border-amber-300";
        }

        container.innerHTML = `
            <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm space-y-4 text-xs sm:text-sm">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <span class="text-slate-400 block font-semibold uppercase text-[10px]">Cultivo Activo:</span>
                        <span class="text-slate-900 font-extrabold text-base">${activeCycle.Cultivo || activeCycle.cultivo}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block font-semibold uppercase text-[10px]">Fecha de Inicio:</span>
                        <span class="text-slate-900 font-bold">${activeCycle.Fecha_Inicio || activeCycle.fecha_inicio}</span>
                    </div>
                </div>

                <div class="border-t border-slate-100 pt-3 space-y-2">
                    <div>
                        <span class="text-slate-400 block font-semibold uppercase text-[10px]">Código de Seguimiento General:</span>
                        <span class="text-violet-700 font-black tracking-wider text-sm">${activeCycle.Codigo_General || activeCycle.codigo_general}</span>
                    </div>
                </div>

                <div class="pt-4 border-t border-slate-100 flex justify-end">
                    <button type="button" onclick="endLoteCycle('${activeCycle.Codigo_General || activeCycle.codigo_general}')" class="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-1">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        Finalizar Ciclo (Liberar Lote)
                    </button>
                </div>
            </div>
        `;
    } else {
        if (label) {
            label.textContent = "LIBRE";
            label.className = "px-3 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider rounded-full border border-emerald-300";
        }

        const cultivosSet = new Set(["Café Castillo", "Aguacate Hass", "Cacao Fino de Aroma", "Limón Tahití", "Plátano Hartón"]);
        if (rawData && rawData.configuracion) {
            (rawData.configuracion || []).forEach(item => {
                const c = String(item.Cultivo_Semilla || item.cultivo_semilla || "").trim();
                if (c) cultivosSet.add(c);
            });
        }
        const optionsHTML = Array.from(cultivosSet).map(c => `<option value="${c}">${c}</option>`).join('');

        container.innerHTML = `
            <div class="bg-white rounded-xl p-5 border border-slate-100 shadow-sm space-y-4">
                <p class="text-xs text-slate-500">Este lote se encuentra liberado. Puedes comenzar un nuevo ciclo de cultivo seleccionando la variedad sembrada.</p>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div>
                        <label class="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Cultivo / Semilla a Sembrar *</label>
                        <select id="cycleCultivo" class="block w-full rounded-xl border-slate-200 bg-white py-2.5 px-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-semibold cursor-pointer border shadow-sm">
                            ${optionsHTML}
                        </select>
                    </div>
                    <div>
                        <button type="button" onclick="startLoteCycle()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-3 rounded-xl transition duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-1.5">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            Iniciar Proceso (Generar Códigos)
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

function startLoteCycle() {
    const lote = document.getElementById("posLote").value;
    const cultivo = document.getElementById("cycleCultivo").value;

    if (!lote || !cultivo) {
        alert("Por favor selecciona un lote y un cultivo.");
        return;
    }

    if (!rawData) rawData = {};
    if (!rawData.ciclos) rawData.ciclos = [];
    const existingActive = (rawData.ciclos || []).find(item => String(item.Lote || item.lote).trim() === lote && String(item.Estado || item.estado).toUpperCase() === 'EN PROCESO');

    if (existingActive) {
        alert(`⚠️ El ${lote} ya cuenta con un ciclo activo en proceso para "${existingActive.Cultivo || existingActive.cultivo}".`);
        return;
    }

    if (!confirm(`¿Estás seguro de iniciar un ciclo de ${cultivo} en el ${lote}?`)) return;

    showLoader(true, "Iniciando ciclo de cultivo...");

    const cleanLote = lote.replace(/\s+/g, "").toUpperCase();
    const cleanCultivo = cultivo.replace(/\s+/g, "").toUpperCase();
    const year = new Date().getFullYear();

    const singleCycleCode = `INI-${cleanLote}-${cleanCultivo}-${year}`;
    const fechaInicio = new Date().toISOString().split('T')[0];

    const record = {
        Lote: lote,
        Cultivo: cultivo,
        Codigo_General: singleCycleCode,
        Codigo_Inicial: singleCycleCode,
        Codigo_Desarrollo: singleCycleCode,
        Codigo_Ventas: singleCycleCode,
        Estado: "EN PROCESO",
        Fecha_Inicio: fechaInicio,
        Fecha_Fin: "-"
    };

    if (typeof google === 'undefined' || !google.script || !google.script.run) {
        setTimeout(() => {
            if (!rawData.ciclos) rawData.ciclos = [];
            (rawData.ciclos || []).push(record);
            updateCyclesTabUI();
            checkPOSLoteSelection();
            updateLoteCycleSummaryCard();
            autoFillActiveCycleCodes();
            showLoader(false);
            alert(`¡Ciclo iniciado con éxito! Código General: ${singleCycleCode}`);
        }, 1000);
    } else {
        google.script.run
            .withSuccessHandler(function(response) {
                showLoader(false);
                if (response && response.success) {
                    if (!rawData.ciclos) rawData.ciclos = [];
                    (rawData.ciclos || []).push(record);
                    updateCyclesTabUI();
                    checkPOSLoteSelection();
                    updateLoteCycleSummaryCard();
                    autoFillActiveCycleCodes();
                    alert(`¡Ciclo iniciado con éxito! Código General: ${singleCycleCode}`);
                } else {
                    alert(response ? response.error : "Error de respuesta del servidor.");
                }
            })
            .withFailureHandler(function(err) {
                showLoader(false);
                alert("Error al iniciar ciclo: " + err.toString());
            })
            .agregarCiclo(lote, cultivo, singleCycleCode, singleCycleCode, singleCycleCode, singleCycleCode, "EN PROCESO", fechaInicio, "-");
    }
}

function endLoteCycleDirect(codigoGeneral, fechaFin, callback) {
    const fFin = fechaFin || new Date().toISOString().split('T')[0];
    const codeUpper = (codigoGeneral || "").toString().trim().toUpperCase();

    const updateLocalCycleState = () => {
        const cycles = rawData.ciclos || [];
        let cycle = cycles.find(item => {
            const cg = (item.Codigo_General || item.codigo_general || "").toString().trim().toUpperCase();
            return cg === codeUpper && String(item.Estado || item.estado).toUpperCase() === "EN PROCESO";
        });

        if (cycle) {
            cycle.Estado = "FINALIZADO";
            cycle.Fecha_Fin = fFin;
        }

        updateCyclesTabUI();
        checkPOSLoteSelection();
        updateLoteCycleSummaryCard();
        autoFillActiveCycleCodes();
        if (typeof applyFilters === 'function') applyFilters();
    };

    if (typeof google === 'undefined' || !google.script || !google.script.run) {
        updateLocalCycleState();
        if (callback) callback();
    } else {
        google.script.run
            .withSuccessHandler(function(response) {
                if (response && response.success) {
                    updateLocalCycleState();
                }
                if (callback) callback();
            })
            .withFailureHandler(function(err) {
                if (callback) callback();
            })
            .finalizarCiclo(codigoGeneral, fFin);
    }
}

function endLoteCycle(codigoGeneral) {
    if (!confirm(`¿Estás seguro de finalizar el ciclo con código ${codigoGeneral}? Esto liberará el lote.`)) return;

    showLoader(true, "Finalizando ciclo de cultivo...");
    const fechaFin = new Date().toISOString().split('T')[0];

    endLoteCycleDirect(codigoGeneral, fechaFin, () => {
        showLoader(false);
        setTimeout(() => {
            alert("¡Ciclo finalizado y lote liberado con éxito!");
        }, 50);
    });
}

function checkPOSLoteSelection() {
    const lote = document.getElementById("posLote").value;
    const contentWrapper = document.getElementById("posFormContentWrapper");
    const banner = document.getElementById("posLoteRequiredBanner");
    const activeCycleBanner = document.getElementById("posActiveCycleAlertBanner");
    const tabs = ['gastos_iniciales', 'gastos_desarrollo', 'ventas', 'ciclos_lot'];
    const isProrrateo = isProrrateoInsumoSelected();

    if (!lote && !isProrrateo) {
        if (contentWrapper) {
            contentWrapper.classList.add("opacity-40", "pointer-events-none", "select-none");
            const elements = contentWrapper.querySelectorAll("input, select, textarea, button");
            elements.forEach(el => el.disabled = true);
        }
        if (banner) banner.classList.remove("hidden");
        if (activeCycleBanner) activeCycleBanner.classList.add("hidden");

        tabs.forEach(t => {
            const btn = document.getElementById(`tabBtn_${t}`);
            if (btn) btn.classList.add("opacity-50", "pointer-events-none");
        });
    } else {
        if (contentWrapper) {
            contentWrapper.classList.remove("opacity-40", "pointer-events-none", "select-none");
            const elements = contentWrapper.querySelectorAll("input, select, textarea, button");
            elements.forEach(el => {
                if (el.id === "posLotePrincipal" && isProrrateo) {
                    el.disabled = true;
                } else {
                    el.disabled = false;
                }
            });
        }
        if (banner) banner.classList.add("hidden");

        tabs.forEach(t => {
            const btn = document.getElementById(`tabBtn_${t}`);
            if (btn) btn.classList.remove("opacity-50", "pointer-events-none");
        });

        if (rawData && rawData.ciclos) {
            const activeCycle = (rawData.ciclos || []).find(item => String(item.Lote || item.lote).trim() === lote && String(item.Estado || item.estado).toUpperCase() === 'EN PROCESO');
            if (activeCycle && activeCycleBanner) {
                const titleEl = document.getElementById("posActiveCycleLoteTitle");
                const msgEl = document.getElementById("posActiveCycleMsg");
                if (titleEl) titleEl.textContent = `Lote Ocupado (${lote})`;
                if (msgEl) {
                    msgEl.innerHTML = `<strong>Cultivo Activo:</strong> ${activeCycle.Cultivo || activeCycle.cultivo} | <strong>Código:</strong> ${activeCycle.Codigo_General || activeCycle.codigo_general}`;
                }
                activeCycleBanner.classList.remove("hidden");
            } else if (activeCycleBanner) {
                activeCycleBanner.classList.add("hidden");
            }
        }
    }
}

function updateLoteCycleSummaryCard() {
    const lote = document.getElementById("posLote").value;
    const summaryCard = document.getElementById("posLoteCycleSummaryCard");
    if (!summaryCard) return;

    if (!lote) {
        summaryCard.classList.add("hidden");
        return;
    }

    if (!rawData) rawData = {};
    if (!rawData.ciclos) rawData.ciclos = [];
    const activeCycle = (rawData.ciclos || []).find(item => String(item.Lote || item.lote).trim() === lote && String(item.Estado || item.estado).toUpperCase() === 'EN PROCESO');

    if (activeCycle) {
        const gralCode = activeCycle.Codigo_General || activeCycle.codigo_general || "";

        const totalIniciales = (rawData.gastosIniciales || [])
            .filter(item => String(item.Lote || item.lote).trim() === lote && String(item.Codigo_General || item.codigo_general || "").trim().toUpperCase() === gralCode.toUpperCase())
            .reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);

        const totalDesarrollo = (rawData.gastosDesarrollo || [])
            .filter(item => String(item.Lote || item.lote).trim() === lote && String(item.Codigo_General || item.codigo_general || "").trim().toUpperCase() === gralCode.toUpperCase())
            .reduce((sum, item) => sum + (Number(item.Costo_Total_COP || item.costo_total_cop) || 0), 0);

        const totalVentas = (rawData.ventas || [])
            .filter(item => String(item.Lote || item.lote).trim() === lote && String(item.Codigo_General || item.codigo_general || "").trim().toUpperCase() === gralCode.toUpperCase())
            .reduce((sum, item) => sum + (Number(item.Ingreso_Total_COP || item.ingreso_total_cop) || 0), 0);

        document.getElementById("posSummaryGeneralCode").textContent = gralCode;
        document.getElementById("posSummaryCrop").textContent = activeCycle.Cultivo || activeCycle.cultivo || "Cultivo";
        document.getElementById("posSummaryGastosIniciales").textContent = formatCOP(totalIniciales);
        document.getElementById("posSummaryGastosDesarrollo").textContent = formatCOP(totalDesarrollo);
        document.getElementById("posSummaryVentas").textContent = formatCOP(totalVentas);

        summaryCard.classList.remove("hidden");
    } else {
        summaryCard.classList.add("hidden");
    }
}

function handlePOSLotePrincipalChange() {
    const posLoteSelect = document.getElementById("posLotePrincipal");
    const mainLoteVal = posLoteSelect ? posLoteSelect.value : "";
    const posLoteInput = document.getElementById("posLote");

    if (posLoteInput) {
        posLoteInput.value = mainLoteVal || "";
    }
    handlePOSLoteChange();
}

function handlePOSLoteChange() {
    checkPOSLoteSelection();
    updateLoteCycleSummaryCard();
    if (activePOSTab === 'ciclos_lot') {
        updateCyclesTabUI();
    } else {
        autoFillActiveCycleCodes();
    }
}

function autoFillActiveCycleCodes() {
    const lote = document.getElementById("posLote").value;
    const codeInput = document.getElementById("posTrackingCode");
    if (!codeInput) return;

    if (!lote) {
        codeInput.value = "";
        codeInput.readOnly = false;
        return;
    }

    if (!rawData) rawData = {};
    if (!rawData.ciclos) rawData.ciclos = [];
    const activeCycle = (rawData.ciclos || []).find(item => String(item.Lote || item.lote).trim() === lote && String(item.Estado || item.estado).toUpperCase() === 'EN PROCESO');

    if (activeCycle) {
        let codeToFill = activeCycle.Codigo_General || activeCycle.codigo_general;
        if (codeToFill) {
            codeInput.value = codeToFill;
            codeInput.readOnly = true;
        } else {
            codeInput.readOnly = false;
        }
    } else {
        codeInput.readOnly = false;
    }
}

function clearPOSForm() {
    const posForm = document.getElementById("posForm");
    if (posForm) posForm.reset();

    const today = new Date().toISOString().split('T')[0];
    ["posFecha", "posFechaVencimientoInicial", "posFechaVencimientoDesarrollo", "posFechaVencimientoVenta"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });

    const textFieldsToClear = [
        "posCostoUnitarioInicial", "posCostoInicial", "posProveedorInicial", "posNotasInicial",
        "posCostoUnitarioDesarrollo", "posCostoDesarrollo", "posProveedorDesarrollo", "posDetalleDesarrollo",
        "posPrecioUnitarioVenta", "posIngresoVenta", "posComprador"
    ];
    textFieldsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const numberFieldsToOne = ["posCantidadInicial", "posCantidadDesarrollo", "posUnidadesVenta"];
    numberFieldsToOne.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "1";
    });

    ["posCultivo", "posInsumo", "posProducto", "posUnidadMedidaInicial", "posUnidadMedidaDesarrollo", "posUnidadMedidaVenta"].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.options && el.options.length > 0) el.selectedIndex = 0;
    });

    handlePOSInsumoChange();
    hidePOSAlert();
    checkPOSLoteSelection();
    updateLoteCycleSummaryCard();
}

function showPOSAlert(msg, type) {
    const alertDiv = document.getElementById("posAlert");
    const alertMsg = document.getElementById("posAlertMsg");
    const iconPath = document.getElementById("posAlertIconPath");

    if (alertDiv && alertMsg && iconPath) {
        alertDiv.classList.remove("hidden");
        alertMsg.textContent = msg;

        if (type === "success") {
            alertDiv.className = "mx-6 mt-4 p-4 rounded-xl flex items-center bg-emerald-50 border border-emerald-200 text-emerald-800";
            iconPath.setAttribute("d", "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z");
        } else {
            alertDiv.className = "mx-6 mt-4 p-4 rounded-xl flex items-center bg-rose-50 border border-rose-200 text-rose-800";
            iconPath.setAttribute("d", "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z");
        }
    }
}

function hidePOSAlert() {
    const alertDiv = document.getElementById("posAlert");
    if (alertDiv) alertDiv.classList.add("hidden");
}

function parseDecimal(val) {
    if (val === null || val === undefined || val === '') return 0;
    const strVal = String(val).replace(',', '.');
    const parsed = parseFloat(strVal);
    return isNaN(parsed) ? 0 : parsed;
}

function calcPOSTotals(section, triggerSource) {
    let qtyEl, unitEl, totalEl;

    if (section === 'inicial') {
        qtyEl = document.getElementById("posCantidadInicial");
        unitEl = document.getElementById("posCostoUnitarioInicial");
        totalEl = document.getElementById("posCostoInicial");
    } else if (section === 'desarrollo') {
        qtyEl = document.getElementById("posCantidadDesarrollo");
        unitEl = document.getElementById("posCostoUnitarioDesarrollo");
        totalEl = document.getElementById("posCostoDesarrollo");
    } else if (section === 'venta') {
        qtyEl = document.getElementById("posUnidadesVenta");
        unitEl = document.getElementById("posPrecioUnitarioVenta");
        totalEl = document.getElementById("posIngresoVenta");
    }

    if (!qtyEl || !unitEl || !totalEl) return;

    const qty = parseDecimal(qtyEl.value) || 1;
    const unit = parseDecimal(unitEl.value);
    const total = parseDecimal(totalEl.value);

    if (triggerSource === 'unitario') {
        totalEl.value = Math.round((qty * unit) * 100) / 100;
    } else if (triggerSource === 'total') {
        if (qty > 0) {
            unitEl.value = Math.round((total / qty) * 100) / 100;
        }
    }
}

function togglePOSDueDate(section) {
    let radioName = "";
    let containerId = "";
    let inputId = "";

    if (section === 'inicial') {
        radioName = "posEstadoPagoInicial";
        containerId = "posContainerFechaVencInicial";
        inputId = "posFechaVencimientoInicial";
    } else if (section === 'desarrollo') {
        radioName = "posEstadoPagoDesarrollo";
        containerId = "posContainerFechaVencDesarrollo";
        inputId = "posFechaVencimientoDesarrollo";
    } else if (section === 'venta') {
        radioName = "posEstadoPagoVenta";
        containerId = "posContainerFechaVencVenta";
        inputId = "posFechaVencimientoVenta";
    }

    const radios = document.getElementsByName(radioName);
    let selectedVal = "PAGADO";
    for (let i = 0; i < radios.length; i++) {
        if (radios[i].checked) {
            selectedVal = radios[i].value;
            break;
        }
    }

    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);

    if (container && input) {
        if (selectedVal === 'PENDIENTE') {
            container.classList.remove("opacity-50", "pointer-events-none");
            input.disabled = false;
        } else {
            container.classList.add("opacity-50", "pointer-events-none");
            input.disabled = true;
        }
    }
}

// --- FUNCIÓN PRINCIPAL DE REGISTRO POS CORREGIDA Y LIMPIA ---
function handlePOSSubmit(event) {
    event.preventDefault();
    hidePOSAlert();

    if (currentUserRole === 'view') {
        showPOSAlert("Tu perfil de usuario es de SOLO LECTURA. No tienes permisos para registrar datos.", "error");
        return;
    }

    const lote = document.getElementById("posLote").value;
    const fecha = document.getElementById("posFecha").value;

    if (!rawData) rawData = {};
    if (!rawData.ciclos) rawData.ciclos = [];
    const activeCycle = (rawData.ciclos || []).find(item => String(item.Lote || item.lote).trim() === lote && String(item.Estado || item.estado).toUpperCase() === 'EN PROCESO');

    let trackingCode = "";
    if (activeCycle) {
        trackingCode = (activeCycle.Codigo_General || activeCycle.codigo_general || "").trim().toUpperCase();
    }

    if (!lote || !fecha) {
        showPOSAlert("Por favor, completa los campos requeridos (*).", "error");
        return;
    }

    showLoader(true);

    if (activePOSTab === 'gastos_iniciales') {
        const cultivo = document.getElementById("posCultivo").value;
        const cantidad = parseDecimal(document.getElementById("posCantidadInicial").value) || 1;
        const unidad = document.getElementById("posUnidadMedidaInicial").value || "Unidades";
        const unitario = parseDecimal(document.getElementById("posCostoUnitarioInicial").value);
        const costo = parseDecimal(document.getElementById("posCostoInicial").value) || (cantidad * unitario);
        
        const radios = document.getElementsByName("posEstadoPagoInicial");
        let estadoPago = "PAGADO";
        for (let r of radios) { if (r.checked) estadoPago = r.value; }

        const proveedor = document.getElementById("posProveedorInicial").value || "";
        const fechaVenc = estadoPago === "PENDIENTE" ? document.getElementById("posFechaVencimientoInicial").value : "";
        const notas = document.getElementById("posNotasInicial").value || "";

        if (!cultivo || costo <= 0) {
            showLoader(false);
            showPOSAlert("Por favor, selecciona un cultivo e ingresa un costo válido mayor a cero.", "error");
            return;
        }

        const record = {
            Lote: lote,
            Cultivo_Semilla: cultivo,
            Cantidad: cantidad,
            Unidad_Medida: unidad,
            Costo_Unitario_COP: unitario || (costo / cantidad),
            Costo_Total_COP: costo,
            Estado_Pago: estadoPago,
            Cliente_Deudor_Proveedor: proveedor,
            Fecha_Vencimiento: fechaVenc,
            Fecha_Pago_Realizado: estadoPago === "PAGADO" ? fecha : "",
            Fecha: fecha,
            Notas: notas,
            Codigo_Seguimiento: trackingCode
        };

        let newCycle = null;
        if (!activeCycle) {
            const generatedCode = trackingCode || `FINCA-${lote.replace(/\s+/g,'').toUpperCase()}-${cultivo.substring(0,3).toUpperCase()}-2026-001`;
            newCycle = {
                Lote_Principal: lote,
                Sub_Lote: "",
                Lote: lote,
                Cultivo: cultivo,
                Codigo_General: generatedCode,
                Codigo_Inicial: generatedCode,
                Codigo_Desarrollo: generatedCode,
                Codigo_Ventas: generatedCode,
                Estado: "EN PROCESO",
                Fecha_Inicio: fecha,
                Fecha_Fin: ""
            };
            record.Codigo_Seguimiento = generatedCode;
            record.Codigo_General = generatedCode;
            if (!rawData.ciclos) rawData.ciclos = [];
            rawData.ciclos.push(newCycle);
        }

        if (!navigator.onLine) {
            saveOfflineRecord("gastosIniciales", record).then(() => {
                if (!rawData.gastosIniciales) rawData.gastosIniciales = [];
                (rawData.gastosIniciales || []).push(record);
                applyFilters();
                showLoader(false);
                clearPOSForm();
                alert("¡Información registrada con éxito (offline)!");
            });
            return;
        }

        if (typeof google === 'undefined' || !google.script || !google.script.run) {
            enviarDatosGoogleSheets('gastosIniciales', record);
            showLoader(false);
            if (!rawData.gastosIniciales) rawData.gastosIniciales = [];
            (rawData.gastosIniciales || []).push(record);
            applyFilters();
            clearPOSForm();
            setTimeout(() => alert("¡Información registrada con éxito!"), 500);
        } else {
            google.script.run
                .withSuccessHandler(function(response) {
                    showLoader(false);
                    if (response && response.success) {
                        if (response.trackingCode) {
                            record.Codigo_Seguimiento = response.trackingCode;
                            record.Codigo_General = response.trackingCode;
                        }
                        if (!rawData.gastosIniciales) rawData.gastosIniciales = [];
                        (rawData.gastosIniciales || []).push(record);
                        applyFilters();
                        clearPOSForm();
                        alert("¡Información registrada con éxito!");
                    } else {
                        showPOSAlert(response ? response.error : "Error de respuesta.", "error");
                    }
                })
                .withFailureHandler(function(err) {
                    showLoader(false);
                    saveOfflineRecord("gastosIniciales", record).then(() => {
                        if (!rawData.gastosIniciales) rawData.gastosIniciales = [];
                        (rawData.gastosIniciales || []).push(record);
                        applyFilters();
                        clearPOSForm();
                        alert("¡Guardado localmente sin conexión!");
                    });
                })
                .guardarRegistro("gastosIniciales", record);
        }

    } else if (activePOSTab === 'gastos_desarrollo') {
        const insumo = document.getElementById("posInsumo").value;
        const cantidad = parseDecimal(document.getElementById("posCantidadDesarrollo").value) || 1;
        const unidad = document.getElementById("posUnidadMedidaDesarrollo").value || "Bultos";
        const unitario = parseDecimal(document.getElementById("posCostoUnitarioDesarrollo").value);
        const costo = parseDecimal(document.getElementById("posCostoDesarrollo").value) || (cantidad * unitario);
        const isProrrateo = (insumo === "Fertilizantes" || insumo === "Pesticidas");
        
        const radios = document.getElementsByName("posEstadoPagoDesarrollo");
        let estadoPago = "PAGADO";
        for (let r of radios) { if (r.checked) estadoPago = r.value; }

        const proveedor = document.getElementById("posProveedorDesarrollo").value || "";
        const fechaVenc = estadoPago === "PENDIENTE" ? document.getElementById("posFechaVencimientoDesarrollo").value : "";
        const detalle = document.getElementById("posDetalleDesarrollo").value || "";

        if (!insumo || costo <= 0) {
            showLoader(false);
            showPOSAlert("Por favor, selecciona un tipo de insumo e ingresa un costo válido.", "error");
            return;
        }

        const record = {
            Lote_Principal: isProrrateo ? "General" : lote,
            Lote: isProrrateo ? "General" : lote,
            Tipo_Insumo: insumo,
            Cantidad: cantidad,
            Unidad_Medida: unidad,
            Costo_Unitario_COP: unitario || (costo / cantidad),
            Costo_Total_COP: costo,
            Estado_Pago: estadoPago,
            Cliente_Deudor_Proveedor: proveedor,
            Fecha_Vencimiento: fechaVenc,
            Fecha_Pago_Realizado: estadoPago === "PAGADO" ? fecha : "",
            Fecha: fecha,
            Detalle: detalle,
            Codigo_Seguimiento: trackingCode
        };

        if (typeof google === 'undefined' || !google.script || !google.script.run) {
            enviarDatosGoogleSheets('gastosDesarrollo', record);
            showLoader(false);
            if (!rawData.gastosDesarrollo) rawData.gastosDesarrollo = [];
            rawData.gastosDesarrollo.push(record);
            applyFilters();
            clearPOSForm();
            alert("¡Gasto de desarrollo registrado con éxito!");
        } else {
            google.script.run
                .withSuccessHandler(function(response) {
                    showLoader(false);
                    if (response && response.success) {
                        if (!rawData.gastosDesarrollo) rawData.gastosDesarrollo = [];
                        rawData.gastosDesarrollo.push(record);
                        applyFilters();
                        clearPOSForm();
                        alert("¡Gasto de desarrollo registrado con éxito!");
                    } else {
                        showPOSAlert(response ? response.error : "Error de respuesta.", "error");
                    }
                })
                .withFailureHandler(function(err) {
                    showLoader(false);
                    saveOfflineRecord("gastosDesarrollo", record).then(() => {
                        if (!rawData.gastosDesarrollo) rawData.gastosDesarrollo = [];
                        rawData.gastosDesarrollo.push(record);
                        applyFilters();
                        clearPOSForm();
                        alert("¡Guardado localmente sin conexión!");
                    });
                })
                .guardarRegistro("gastosDesarrollo", record);
        }

    } else if (activePOSTab === 'ventas') {
        const producto = document.getElementById("posProducto").value;
        const cantidad = parseDecimal(document.getElementById("posUnidadesVenta").value) || 1;
        const unidad = document.getElementById("posUnidadMedidaVenta").value || "Atados";
        const unitario = parseDecimal(document.getElementById("posPrecioUnitarioVenta").value);
        const ingreso = parseDecimal(document.getElementById("posIngresoVenta").value) || (cantidad * unitario);
        
        const radios = document.getElementsByName("posEstadoPagoVenta");
        let estadoPago = "PAGADO";
        for (let r of radios) { if (r.checked) estadoPago = r.value; }

        const comprador = document.getElementById("posComprador").value || "";
        const fechaVenc = estadoPago === "PENDIENTE" ? document.getElementById("posFechaVencimientoVenta").value : "";

        if (!producto || ingreso <= 0 || !comprador) {
            showLoader(false);
            showPOSAlert("Por favor, completa los datos de la venta.", "error");
            return;
        }

        const record = {
            Lote: lote,
            Producto_Vendido: producto,
            Cantidad: cantidad,
            Unidades_Cosechadas: cantidad,
            Unidad_Medida: unidad,
            Precio_Unitario_COP: unitario || (ingreso / cantidad),
            Ingreso_Total_COP: ingreso,
            Estado_Pago: estadoPago,
            Cliente_Deudor_Proveedor: comprador,
            Comprador: comprador,
            Fecha_Vencimiento: fechaVenc,
            Fecha_Pago_Realizado: estadoPago === "PAGADO" ? fecha : "",
            Fecha: fecha,
            Codigo_Seguimiento: trackingCode
        };

        const cerrarCicloChecked = document.getElementById("posCerrarCicloVenta")?.checked;

        if (typeof google === 'undefined' || !google.script || !google.script.run) {
            enviarDatosGoogleSheets('ventas', record);
            showLoader(false);
            if (!rawData.ventas) rawData.ventas = [];
            rawData.ventas.push(record);
            applyFilters();
            clearPOSForm();
            alert("¡Venta registrada con éxito!");
        } else {
            google.script.run
                .withSuccessHandler(function(response) {
                    showLoader(false);
                    if (response && response.success) {
                        if (!rawData.ventas) rawData.ventas = [];
                        rawData.ventas.push(record);

                        if (cerrarCicloChecked && trackingCode) {
                            endLoteCycleDirect(trackingCode, fecha, () => {
                                applyFilters();
                                clearPOSForm();
                                alert("¡Venta registrada y ciclo cerrado!");
                            });
                        } else {
                            applyFilters();
                            clearPOSForm();
                            alert("¡Venta registrada con éxito!");
                        }
                    } else {
                        showPOSAlert(response ? response.error : "Error de respuesta.", "error");
                    }
                })
                .withFailureHandler(function(err) {
                    saveOfflineRecord("ventas", record).then(() => {
                        if (!rawData.ventas) rawData.ventas = [];
                        rawData.ventas.push(record);
                        applyFilters();
                        showLoader(false);
                        clearPOSForm();
                        alert("¡Guardado localmente sin conexión!");
                    });
                })
                .guardarRegistro("ventas", record);
        }
    }
}

function populateLoteDropdowns() {
    const selects = [
        document.getElementById("loteSelector"),
        document.getElementById("filterLote"),
        document.getElementById("cashflowLoteSelector")
    ];

    let optionsHTML = '<option value="Todos">Todos los Lotes</option>';
    for (let i = 1; i <= 16; i++) {
        optionsHTML += `<option value="Lote ${i}">Lote ${i}</option>`;
    }

    selects.forEach(selectEl => {
        if (selectEl) {
            const currentVal = selectEl.value;
            selectEl.innerHTML = optionsHTML;
            if (currentVal && [...selectEl.options].some(o => o.value === currentVal)) {
                selectEl.value = currentVal;
            }
        }
    });
}

function populateDropdowns() {
    populateLoteDropdowns();
    if (!rawData) return;
    
    const cultivosSet = new Set();
    const insumosSet = new Set();
    const productosSet = new Set();
    
    (rawData.configuracion || []).forEach(item => {
        const c = String(item.Cultivo_Semilla || item.cultivo_semilla || "").trim();
        const ins = String(item.Tipo_Insumo || item.tipo_insumo || "").trim();
        const p = String(item.Producto_Vendido || item.producto_vendido || "").trim();
        
        if (c) cultivosSet.add(c);
        if (ins) insumosSet.add(ins);
        if (p) productosSet.add(p);
    });

    const cultivos = cultivosSet.size > 0 ? Array.from(cultivosSet) : ["Café Castillo", "Aguacate Hass", "Cacao Fino de Aroma", "Limón Tahití", "Plátano Hartón"];
    const insumos = insumosSet.size > 0 ? Array.from(insumosSet) : ["Fertilizantes", "Mano de Obra", "Pesticidas", "Riego", "Herramientas", "Otros"];
    const productos = productosSet.size > 0 ? Array.from(productosSet) : ["Café Pergamino Seco", "Aguacate Hass Extra", "Cacao en Grano", "Limón Tahití Selección", "Plátano Hartón de Primera"];
    
    const cultivoSelect = document.getElementById("posCultivo");
    if (cultivoSelect) {
        cultivoSelect.innerHTML = '<option value="" disabled selected>Selecciona un cultivo...</option>';
        cultivos.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            cultivoSelect.appendChild(opt);
        });
    }
    
    const insumoSelect = document.getElementById("posInsumo");
    if (insumoSelect) {
        insumoSelect.innerHTML = '<option value="" disabled selected>Selecciona un tipo de insumo...</option>';
        insumos.forEach(ins => {
            const opt = document.createElement("option");
            opt.value = ins;
            opt.textContent = ins;
            insumoSelect.appendChild(opt);
        });
    }
    
    const productoSelect = document.getElementById("posProducto");
    if (productoSelect) {
        productoSelect.innerHTML = '<option value="" disabled selected>Selecciona un producto...</option>';
        productos.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p;
            productoSelect.appendChild(opt);
        });
    }

    const filterCultivoSelect = document.getElementById("filterCultivo");
    if (filterCultivoSelect) {
        filterCultivoSelect.innerHTML = '<option value="Todos">Todos los Cultivos</option>';
        cultivos.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            filterCultivoSelect.appendChild(opt);
        });
        filterCultivoSelect.value = "Todos";
    }
}

let currentUserRole = "admin";

function checkCurrentUserRole() {
    currentUserRole = "admin";
}

function renderTransaccionesTable(selectedLote) {
    const tableBody = document.getElementById("transaccionesTableBody");
    if (!tableBody || !rawData) return;
    tableBody.innerHTML = "";
    // Renderizado básico de transacciones
}

function initApp() {
    populateLoteDropdowns();
    fetchData();
    updatePendingSyncBadge();
    checkCurrentUserRole();
}

function enviarDatosGoogleSheets(tipo, record) {
    const callbackName = 'jsonpCallback_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');

    window[callbackName] = function(response) {
        if (document.body.contains(script)) document.body.removeChild(script);
        delete window[callbackName];
    };

    script.src = MI_GAS_URL + '?action=' + tipo + getAuthEmailParam() + '&callback=' + callbackName + '&args=' + encodeURIComponent(JSON.stringify([record]));
    document.body.appendChild(script);
}
