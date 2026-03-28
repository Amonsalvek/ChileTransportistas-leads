const API = "https://script.google.com/macros/s/AKfycbxtYnF03s9lFWAXtFEhtwnAPZZaePG0ur85kR-vMT7Iv-OC6Kfj-USLb3myVgzm1KCQ/exec";

let CURRENT_USER = null;
let LEADS = [];
let RECLAMADOS = [];
let CURRENT_LEAD = null;
let USER_TOKENS = 0; // ← NUEVA
let PLANES = []; // ← NUEVA

// Al inicio de app.js, antes de todo
firebase.initializeApp({
  apiKey: "AIzaSyAQ-oSswExq-C3IX0wP0Vmzh3ZCYY50GDE",
  authDomain: "chiletransportistas-d44ce.firebaseapp.com",
  projectId: "chiletransportistas-d44ce",
  storageBucket: "chiletransportistas-d44ce.firebasestorage.app",
  messagingSenderId: "448616206348",
  appId: "1:448616206348:web:bab54d05346df56760de29"
});

// =========================
// UTIL para llamar a API
// =========================
async function api(body) {
  try {
    const res = await fetch(API, {
      method: "POST",
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (error) {
    console.error("API ERROR:", error);
    return { error: true };
  }
}

function normalizarTelefono(numero) {
  if (!numero) return '';
  
  // Convertir a string y limpiar espacios y caracteres especiales
  let clean = String(numero).replace(/[\s\-\(\)]/g, '');
  
  // Si ya tiene +56, dejarlo como está
  if (clean.startsWith('+56')) {
    return clean;
  }
  
  // Si tiene 56 al inicio (sin +), agregar el +
  if (clean.startsWith('56') && clean.length >= 11) {
    return '+' + clean;
  }
  
  // Si es un número de 9 dígitos (celular chileno sin código de país)
  if (clean.length === 9 && clean.startsWith('9')) {
    return '+569' + clean;
  }
  
  // Si tiene 10 dígitos y empieza con 09
  if (clean.length === 10 && clean.startsWith('09')) {
    return '+569' + clean.substring(1);
  }
  
  // Si el número es muy largo o muy corto, retornar solo los primeros dígitos válidos
  if (clean.length > 12) {
    // Buscar patrón +56 9 XXXXXXXX (11-12 dígitos)
    const match = clean.match(/(\+?56)?9\d{8}/);
    if (match) {
      const foundNumber = match[0].replace('+', '');
      return foundNumber.startsWith('56') ? '+' + foundNumber : '+56' + foundNumber;
    }
  }
  
  // Por defecto, si tiene 9 dígitos, asumir que es chileno
  if (clean.length === 9) {
    return '+569' + clean;
  }
  
  // Si no cumple ningún patrón, retornar el número limpio
  return clean;
}

// =========================
// VALIDACIÓN DE EMAIL
// =========================
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// =========================
// SANITIZACIÓN
// =========================
function sanitizeInput(input) {
  if (!input) return '';
  return String(input).trim().slice(0, 500);
}

// =========================
// MANEJO DE COOKIES
// =========================
function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + date.toUTCString();
  document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Strict";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function deleteCookie(name) {
  document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

// =========================
// VALIDAR SESIÓN AL CARGAR
// =========================
async function checkSession() {
  const token = getCookie("auth_token");
  
  if (!token) {
    return false;
  }

  // Mostrar spinner mientras valida
  const spinner = document.getElementById("spinner");
  if (spinner) {
    spinner.style.display = 'flex';
  }

  const res = await api({ action: "validateToken", token: token });

  if (spinner) {
    spinner.style.display = 'none';
  }

  if (res.valid && res.email) {
    CURRENT_USER = res.email;
    startDashboard();
    return true;
  } else {
    console.log("Token inválido o expirado");
    deleteCookie("auth_token");
    return false;
  }
}

// =========================
// OCULTAR LOGIN CONTENT
// =========================
function hideLoginContent() {
  const loginContent = document.getElementById("login-content-wrapper");
  if (loginContent) {
    loginContent.style.display = "none";
  }
}

// =========================
// MOSTRAR LOGIN CONTENT
// =========================
function showLoginContent() {
  const loginContent = document.getElementById("login-content-wrapper");
  if (loginContent) {
    loginContent.style.display = "block";
  }
}

const NOTIF_LEADS_KEY = 'notif_last_lead_ids';
const NOTIF_TIMESTAMP_KEY = 'notif_last_check_ts';

// =======================================================
// LOGIN
// =======================================================
document.addEventListener("DOMContentLoaded", async () => {

  const btnLogin = document.getElementById("btn-login");
  const btnRegistrar = document.getElementById("btn-registrar");
  const btnValidarCodigo = document.getElementById("btn-validar-codigo");

  if (!btnLogin || !btnRegistrar || !btnValidarCodigo) {
    console.error("❌ ERROR: Hay elementos que NO existen en el HTML.");
    return;
  }

  // Deshabilitar botón mientras busca sesión
  btnLogin.disabled = true;
  btnLogin.style.opacity = "0.6";
  btnLogin.style.cursor = "not-allowed";
  
  // Intentar restaurar sesión
  const sessionValid = await checkSession();
  
  // Habilitar botón después de verificar
  btnLogin.disabled = false;
  btnLogin.style.opacity = "1";
  btnLogin.style.cursor = "pointer";
  
  if (sessionValid) {
    // Si la sesión es válida, no mostrar el formulario de login
    return;
  }

  // -----------------------------
  // LOGIN CLICK
  // -----------------------------
  btnLogin.onclick = async () => {
    const email = sanitizeInput(document.getElementById("login-email").value);
    const loginError = document.getElementById("login-error");

    loginError.innerText = "";

    if (!email) {
      loginError.innerText = "Ingresa tu email.";
      return;
    }

    if (!isValidEmail(email)) {
      loginError.innerText = "Ingresa un correo válido.";
      return;
    }

    btnLogin.disabled = true;
    document.getElementById("spinner").style.display = 'flex';

    const res = await api({ action: "login", email });

    btnLogin.disabled = false;
    document.getElementById("spinner").style.display = 'none';

    if (res.error) {
      loginError.innerText = "Error conectando al servidor.";
      return;
    }

    // Registro de nuevo usuario
    if (!res.exists) {
      document.getElementById("register-box").classList.remove("hidden");
      document.getElementById("email-register").value = email;
      document.getElementById("email-login").style.display = 'none';
      document.getElementById("login-card").querySelector('h1').innerText = 'Registrarme';
      btnLogin.style.display = 'none';
      return;
    }

    // Validación de correo
    if (res.validador !== true && res.validador !== "true") {
      hideLoginContent();
      document.getElementById("login-view").classList.remove("active");
      document.getElementById("validacion-view").classList.add("active");
      document.getElementById("email-validacion").innerText = email;
      return;
    }

    // Inicio de sesión exitoso - Guardar token
    if (res.token) {
      setCookie("auth_token", res.token, 30); // Token válido por 30 días
    }

    CURRENT_USER = email;
    startDashboard();
  };

  document.getElementById("login-email").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      btnLogin.click();
    }
  });

  document.querySelector('.btn-consigue-cliente').addEventListener('click',  function (e) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      document.getElementById("login-email").focus();
    }, 500);
  });

  // =======================================================
  // REGISTRO
  // =======================================================
  btnRegistrar.onclick = async () => {
    const email = sanitizeInput(document.getElementById("email-register").value);
    const nombre = sanitizeInput(document.getElementById("reg-nombre").value);
    const apellido = sanitizeInput(document.getElementById("reg-apellido").value);
    const optin = document.getElementById("reg-optin")?.checked || false;
    const loginError = document.getElementById("login-error");
  
    loginError.innerText = "";
  
    if (!email || !nombre || !apellido) {
      loginError.innerText = "Completa todos los campos.";
      return;
    }
  
    if (!isValidEmail(email)) {
      loginError.innerText = "Email inválido.";
      return;
    }
  
    if (nombre.length < 2 || apellido.length < 2) {
      loginError.innerText = "Nombre y apellido deben tener al menos 2 caracteres.";
      return;
    }
  
    btnRegistrar.disabled = true;
    document.getElementById("spinner-registrar").style.display = 'flex';
  
    const res = await api({ action: "register", email, nombre, apellido, optin });

    btnRegistrar.disabled = false;
    document.getElementById("spinner-registrar").style.display = 'none';

    if (res.error) {
      loginError.innerText = "Error al registrar. El email podría estar en uso.";
      return;
    }

    // Ocultar contenido de login y mostrar validación
    hideLoginContent();
    document.getElementById("login-view").classList.remove("active");
    document.getElementById("validacion-view").classList.add("active");
    document.getElementById("email-validacion").innerText = email;
  };

  // =======================================================
  // VALIDAR CÓDIGO
  // =======================================================
  btnValidarCodigo.onclick = async () => {
    const email = sanitizeInput(document.getElementById("email-validacion").innerText);
    const codigo = sanitizeInput(document.getElementById("input-codigo").value);
    const msg = document.getElementById("validacion-error");

    msg.innerText = "";

    if (!codigo) {
      msg.innerText = "Ingresa tu código.";
      return;
    }

    if (!/^\d{6}$/.test(codigo)) {
      msg.innerText = "El código debe ser de 6 dígitos.";
      return;
    }

    btnValidarCodigo.disabled = true;
    const res = await api({ action: "validate", email, codigo });
    btnValidarCodigo.disabled = false;

    if (!res.ok) {
      msg.innerText = "Código incorrecto.";
      return;
    }

    // Código validado exitosamente - Guardar token
    if (res.token) {
      setCookie("auth_token", res.token, 30); // Token válido por 30 días
    }

    CURRENT_USER = email;
    startDashboard();
  };

}); // DOMContentLoaded END

// =======================================================
// DASHBOARD
// =======================================================
// =======================================================
// TOKENS Y PLANES
// =======================================================
async function loadTokens() {
  const res = await api({ action: "getTokens", email: CURRENT_USER });
  USER_TOKENS = res.tokens || 0;
  
  // Actualizar UI
  const tokenDisplay = document.getElementById("user-tokens");
  if (tokenDisplay) {
    tokenDisplay.innerText = USER_TOKENS;
  }
  
  return USER_TOKENS;
}

async function loadPlanes() {
  PLANES = await api({ action: "getPlanes" });
  if (!Array.isArray(PLANES)) {
    PLANES = [];
  }
  return PLANES;
}

async function renderPlanes() {
  document.getElementById('spinner-recarga-tokens-container').style.display = 'flex';
  // Cargar planes si no están cargados
  if (PLANES.length === 0) {
    await loadPlanes();
  }
  
  const planesContainer = document.querySelector("#planes-view .pricing-grid");
  if (!planesContainer) {
    console.error("Container de planes no encontrado");
    return;
  }
  
  // Limpiar contenedor
  planesContainer.innerHTML = "";
  
  // Definir características por plan
  const planFeatures = {
    starter: [
      "Acceso a leads disponibles",
      "1 token por lead",
      "Verificación gratis en el directorio de transporte más grande de Chile",
      "Soporte por email"
    ],
    pro: [
      "Acceso a leads disponibles",
      "1 token por lead",
      "Registro gratis en directorio",
      "20% de descuento",
      "Soporte prioritario"
    ],
    custom: [
      "Leads exclusivos sin competencia",
      "Contacto directo garantizado",
      "Registro destacado en directorio",
      "Accede a Tokens ilimitados",
      "Soporte VIP 24/7",
      "Consultoría personalizada"
    ]
  };
  
  // Crear cards dinámicamente
  PLANES.forEach((plan) => {
    const card = document.createElement("div");
    card.className = "pricing-card";
    
    // Marcar el plan Pro como featured
    if (plan.plan_id === "pro") {
      card.classList.add("featured");
    }
    
    let precioDisplay = "";
    let precioFullDisplay = "";
    let tokensDisplay = "";
    let buttonText = "Comprar Ahora";
    
    if (plan.plan_id === "custom") {
      precioDisplay = "Cotiza";
      tokensDisplay = "Plan Personalizado";
      buttonText = "Contactar";
    } else {
      try {
        precioDisplay = `$${plan.precio_clp.toLocaleString('es-CL')}`;
        precioFullDisplay = `$${plan.precio_full_clp.toLocaleString('es-CL')}`;
        tokensDisplay = `${plan.tokens} Tokens`;
      } catch (e) {
        precioDisplay = "";
        precioFullDisplay = "";
        tokensDisplay = "";
      }
    }
    
    // Obtener features del plan
    const features = planFeatures[plan.plan_id] || [];
    
    card.innerHTML = `
      ${plan.plan_id === "pro" ? '<div class="badge">Más Popular</div>' : ''}
      <h3>${plan.nombre}</h3>
      <div class="price_full">${precioFullDisplay}</div>
      <div class="price">${precioDisplay}</div>
      <div class="tokens">${tokensDisplay}</div>
      <ul class="features">
        ${features.map(feature => `<li>${feature}</li>`).join('')}
      </ul>
      <button class="btn-comprar primary" data-plan="${plan.plan_id}">${buttonText}</button>
    `;
    
    planesContainer.appendChild(card);
  });
  
  // Agregar event listeners a los botones de compra
  document.querySelectorAll(".btn-comprar").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const planId = e.target.getAttribute("data-plan");
      if (planId === "custom") {
        // Abrir WhatsApp para contacto
        window.open("https://wa.me/56999171230?text=Hola!%20Estoy%20interesado%20en%20el%20plan%20Custom%20con%20leads%20exclusivos", "_blank");
      } else {
        iniciarCompraMercadoPago(planId);
      }
    });
  });
  document.getElementById('spinner-recarga-tokens-container').style.display = 'none';
}

// Función placeholder para MercadoPago (implementaremos después)
function iniciarCompraMercadoPago(planId) {
  if (planId == "starter") {
    window.open('https://mpago.la/2RXQ72q')
  } else if (planId == "pro") {
    window.open('https://mpago.la/2SrgtAU')
  } 
}

// =======================================================
// DASHBOARD
// =======================================================
async function startDashboard() {
  // Ocultar todo el contenido de login
  hideLoginContent();
  
  // Ocultar vistas de login y validación
  document.getElementById("login-view").classList.remove("active");
  document.getElementById("validacion-view").classList.remove("active");
  
  // Mostrar dashboard
  document.getElementById("dashboard-view").classList.add("active");

  // Update user email in sidebar
  const sidebarUserEmail = document.getElementById("sidebar-user-email");
  if (sidebarUserEmail && CURRENT_USER) {
    sidebarUserEmail.textContent = CURRENT_USER;
    sidebarUserEmail.style.display = "block";
    sidebarUserEmail.style.visibility = "visible";
    sidebarUserEmail.style.opacity = "1";
  }

  // Hide login topbar
  const loginTopbar = document.getElementById("login-topbar");
  if (loginTopbar) {
    loginTopbar.style.display = "none";
  }

  // Initialize sidebar functionality
  initSidebar();

  // Load settings
  loadSettings();

  // Load tokens
  await loadTokens();

  // Set initial view to leads disponibles
  switchView("leads-disponibles");
  const navItems = document.querySelectorAll(".sidebar-nav-item");
  navItems.forEach(nav => {
    if (nav.getAttribute("data-view") === "leads-disponibles") {
      nav.classList.add("active");
    }
  });

  document.getElementById("spinner-disponibles").style.display = "flex";

  await loadLeads();
  await loadReclamados();

  document.getElementById("spinner-disponibles").style.display = "none";

  // Arrancar polling si ya tiene permiso (sesión anterior)
  if (Notification.permission === 'granted') {
    // startLeadPolling();
    initPushNotifications();
  }

  // Iniciar push notifications (reemplaza startLeadPolling)
  setTimeout(() => {
    if (!checkOnboarding()) {
      showNotifModal();
    }
  }, 700);

  // Registrar SW siempre, independiente del onboarding
  initPushNotifications();
}

// =======================================================
// SIDEBAR FUNCTIONALITY
// =======================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const sidebarUserToggle = document.getElementById("sidebar-user-toggle");
  const sidebarUserDropdown = document.getElementById("sidebar-user-dropdown");
  const sidebarLogout = document.getElementById("sidebar-logout");
  const navItems = document.querySelectorAll(".sidebar-nav-item");

  // Close sidebar
  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebar.classList.add("closed");
    sidebarOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  // Open sidebar
  function openSidebar() {
    sidebar.classList.remove("closed");
    if (window.innerWidth <= 768) {
      sidebar.classList.add("open");
      sidebarOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  }
  
  // Initialize sidebar state - collapsed by default on desktop, closed on mobile
  if (window.innerWidth > 768) {
    sidebar.classList.remove("closed");
    sidebar.classList.add("collapsed");
  } else {
    sidebar.classList.add("closed");
    sidebar.classList.remove("collapsed");
  }
  
  // Desktop hover to expand functionality
  if (window.innerWidth > 768) {
    let hoverTimeout;
    let isHovering = false;
    let clickedToExpand = false; // Track if user clicked to expand
    
    sidebar.addEventListener("mouseenter", () => {
      if (sidebar.classList.contains("collapsed")) {
        isHovering = true;
        hoverTimeout = setTimeout(() => {
          if (isHovering && !clickedToExpand) {
            sidebar.classList.remove("collapsed");
            sidebar.setAttribute("data-hover-expanded", "true");
          }
        }, 1000); // 1 second delay
      }
    });
    
    sidebar.addEventListener("mouseleave", () => {
      isHovering = false;
      clearTimeout(hoverTimeout);
      
      // Auto-collapse if expanded by hover (not by click)
      if (sidebar.getAttribute("data-hover-expanded") === "true") {
        sidebar.classList.add("collapsed");
        sidebar.removeAttribute("data-hover-expanded");
      }
    });
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      if (window.innerWidth > 768) {
        // Desktop: Toggle collapsed state
        if (sidebar.classList.contains("collapsed")) {
          sidebar.classList.remove("collapsed");
          sidebar.removeAttribute("data-hover-expanded");
        } else if (sidebar.classList.contains("closed")) {
          sidebar.classList.remove("closed");
          sidebar.classList.remove("collapsed");
          sidebar.removeAttribute("data-hover-expanded");
        } else {
          sidebar.classList.add("collapsed");
          sidebar.removeAttribute("data-hover-expanded");
        }
      } else {
        // Mobile: Toggle open/closed
        if (sidebar.classList.contains("closed")) {
          openSidebar();
        } else {
          closeSidebar();
        }
      }
    });
  }

  // User dropdown toggle - make the whole user info area clickable
  const sidebarUserInfo = document.querySelector(".sidebar-user-info");
  if (sidebarUserInfo) {
    sidebarUserInfo.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebarUserDropdown.classList.toggle("active");
      sidebarUserDropdown.classList.remove("hidden");
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (sidebarUserDropdown && sidebarUserInfo && 
        !sidebarUserDropdown.contains(e.target) && 
        !sidebarUserInfo.contains(e.target)) {
      sidebarUserDropdown.classList.remove("active");
      // Don't add hidden back immediately to allow transition
      setTimeout(() => {
        if (!sidebarUserDropdown.classList.contains("active")) {
          sidebarUserDropdown.classList.add("hidden");
        }
      }, 300);
    }
  });

  // Logout - Eliminar cookie y recargar
  if (sidebarLogout) {
    sidebarLogout.addEventListener("click", () => {
      deleteCookie("auth_token");
      CURRENT_USER = null;
      LEADS = [];
      RECLAMADOS = [];
      CURRENT_LEAD = null;
      location.reload();
    });
  }

  // Navigation items
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const view = item.getAttribute("data-view");
      if (view) {
        switchView(view);
        // Update active state
        navItems.forEach(nav => nav.classList.remove("active"));
        item.classList.add("active");
        // Close sidebar on mobile after selection
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      }
    });
  });
}

// =======================================================
// VIEW SWITCHING
// =======================================================
async function switchView(viewName) {
  // Hide all views
  const views = document.querySelectorAll(".content-view");
  views.forEach(view => view.classList.remove("active"));

  // Show selected view
  const targetView = document.getElementById(`${viewName}-view`);
  if (targetView) {
    targetView.classList.add("active");
  }

  // Load data if needed
  if (viewName === "leads-reclamados") {
    loadReclamados();
  } else if (viewName === "planes") {
    renderPlanes();
  }
}

// =======================================================
// SETTINGS
// =======================================================
async function loadSettings() {
  // Primero intentar cargar desde el servidor
  try {
    const res = await api({ action: "getSettings", email: CURRENT_USER });
    
    if (res.error) {
      console.error("Error cargando settings:", res.error);
      // Si hay error, usar localStorage como fallback
      const localSettings = JSON.parse(localStorage.getItem("userSettings") || "{}");
      applySettings(localSettings);
      return;
    }
    
    // Aplicar settings del servidor
    applySettings(res);
    
    // También guardar en localStorage como cache
    localStorage.setItem("userSettings", JSON.stringify(res));
    
  } catch (error) {
    console.error("Error en loadSettings:", error);
    // Fallback a localStorage
    const localSettings = JSON.parse(localStorage.getItem("userSettings") || "{}");
    applySettings(localSettings);
  }
}

// NUEVA FUNCIÓN - Agrégala después de loadSettings
function applySettings(settings) {
  const notificationsToggle = document.getElementById("notifications-toggle");
  const frequencyGroup = document.getElementById("notifications-frequency");
  const frequencyEach = document.getElementById("frequency-each");
  const frequencyDaily = document.getElementById("frequency-daily");

  if (notificationsToggle) {
    notificationsToggle.checked = settings.notificationsEnabled || false;
    updateFrequencyVisibility(notificationsToggle.checked);
    
    notificationsToggle.addEventListener("change", (e) => {
      const enabled = e.target.checked;
      updateFrequencyVisibility(enabled);
      saveSettings({
        notificationsEnabled: enabled,
        frequency: settings.frequency || "daily"
      });
    });
  }

  if (frequencyEach && frequencyDaily) {
    const currentFrequency = settings.frequency || "daily";
    if (currentFrequency === "each") {
      frequencyEach.checked = true;
    } else {
      frequencyDaily.checked = true;
    }

    [frequencyEach, frequencyDaily].forEach(radio => {
      radio.addEventListener("change", (e) => {
        saveSettings({
          notificationsEnabled: settings.notificationsEnabled || false,
          frequency: e.target.value
        });
      });
    });
  }
}

function updateFrequencyVisibility(enabled) {
  const frequencyGroup = document.getElementById("notifications-frequency");
  if (frequencyGroup) {
    if (enabled) {
      frequencyGroup.classList.remove("hidden");
    } else {
      frequencyGroup.classList.add("hidden");
    }
  }
}

async function saveSettings(settings) {
  // Guardar en localStorage como cache
  localStorage.setItem("userSettings", JSON.stringify(settings));
  
  // Guardar en el servidor
  try {
    const res = await api({ 
      action: "updateSettings", 
      email: CURRENT_USER,
      notificationsEnabled: settings.notificationsEnabled,
      frequency: settings.frequency
    });
    
    if (res.error) {
      console.error("Error guardando settings:", res.error);
      alert("Error al guardar configuración. Por favor intenta de nuevo.");
    } else {
      console.log("Configuración guardada correctamente ✅");
    }
  } catch (error) {
    console.error("Error en saveSettings:", error);
    alert("Error al guardar configuración. Por favor intenta de nuevo.");
  }
}

// Reemplaza el bloque de tbody en loadLeads() por:
async function loadLeads() {
  document.getElementById("spinner-disponibles").style.display = "flex";
  LEADS = await api({ action: "getLeads", email: CURRENT_USER });
  if (!Array.isArray(LEADS)) LEADS = [];

  // Guardar IDs para polling
  // localStorage.setItem(NOTIF_LEADS_KEY, JSON.stringify(LEADS.map(l => String(l.ID))));
  localStorage.setItem(NOTIF_TIMESTAMP_KEY, Date.now().toString());

  populateFilterOptions('disponibles', LEADS);
  aplicarFiltros('disponibles'); // respeta filtros activos al recargar
  document.getElementById("spinner-disponibles").style.display = "none";
}

async function loadReclamados() {
  document.getElementById("spinner-reclamados").style.display = "flex";
  RECLAMADOS = await api({ action: "getReclamados", email: CURRENT_USER });
  if (!Array.isArray(RECLAMADOS)) RECLAMADOS = [];

  const todosLosLeads = await api({ action: "getAllLeads" });

  // Construir array de leads completos con fecha_reclamo
  RECLAMADOS_FULL = RECLAMADOS.reduce((acc, rec) => {
    let lead = LEADS.find(l => l.ID == rec.ID) || todosLosLeads.find(l => l.ID == rec.ID);
    if (lead) acc.push({ ...lead, fecha_reclamo: rec.fecha_reclamo });
    return acc;
  }, []);

  populateFilterOptions('reclamados', RECLAMADOS_FULL);
  aplicarFiltros('reclamados');
  document.getElementById("spinner-reclamados").style.display = "none";
}

// =======================================================
// LEAD VIEW
// =======================================================
function verLead(id) {
  CURRENT_LEAD = LEADS.find(l => l.ID == id);

  if (!CURRENT_LEAD) {
    alert("Lead no encontrado.");
    return;
  }

  mostrarDetalleLead(false);
}

function verLeadReclamado(id) {
  CURRENT_LEAD = LEADS.find(l => l.ID == id);

  if (!CURRENT_LEAD) {
    api({ action: "getAllLeads" }).then(todosLosLeads => {
      CURRENT_LEAD = todosLosLeads.find(l => l.ID == id);
      if (CURRENT_LEAD) {
        mostrarDetalleLead(true);
      } else {
        alert("Lead no encontrado.");
      }
    });
    return;
  }

  mostrarDetalleLead(true);
}

function mostrarDetalleLead(yaReclamado) {
  // Keep dashboard view active (for sidebar)
  document.getElementById("dashboard-view").classList.add("active");
  // Show lead view as overlay
  document.getElementById("lead-view").classList.add("active");

  document.getElementById("lead-title").innerText = `Lead de ${CURRENT_LEAD.Categoria}`;

  let fecha = CURRENT_LEAD["CREATED ON"];
  try {
    let d = new Date(fecha);
    if (!isNaN(d)) {
      let day = String(d.getDate()).padStart(2, '0');
      let month = String(d.getMonth() + 1).padStart(2, '0');
      let year = d.getFullYear();
      fecha = `${day}/${month}/${year}`;
    }
  } catch (e) {}
  document.getElementById("lead-fecha").innerText = fecha;
  document.getElementById("lead-mensaje").innerText = CURRENT_LEAD.MESSAGE;
  document.getElementById("lead-origen").innerText = CURRENT_LEAD["region-origen"];
  document.getElementById("lead-destino").innerText = CURRENT_LEAD["region-destino"];
  document.getElementById("lead-categoria").innerText = CURRENT_LEAD.Categoria;

  document.getElementById("reclamo-msg").classList.add("hidden");
  document.getElementById("spinner-reclamar")?.classList?.add("hidden");

  if (yaReclamado) {
    document.getElementById("contacto-box").classList.remove("hidden");
    document.getElementById("btn-reclamar").classList.add("hidden");
    // document.getElementById("reclamar-info").classList.add("hidden");

    document.getElementById("lead-nombre").innerText = CURRENT_LEAD.FNAME || '';
    // Completar email
    const leadEmail = CURRENT_LEAD.EMAIL || '';
    const emailSpan = document.getElementById("lead-email");

    if (leadEmail) {
      emailSpan.innerHTML = `<a href="mailto:${leadEmail}" style="color: #007bff; text-decoration: none;">${leadEmail}</a>`;
    } else {
      emailSpan.innerText = '';
    }
    // Completar teléfono
    const leadTel = normalizarTelefono(CURRENT_LEAD.TEL);
    const telSpan = document.getElementById("lead-tel");
    const wspSpan = document.getElementById("lead-wsp");
    
    if (leadTel) {
      telSpan.innerHTML = leadTel 
      ? `<a href="tel:${leadTel}" style="color: #007bff; text-decoration: none;">${leadTel}</a>` 
      : '';

      const mensaje = `Hola ${CURRENT_LEAD.FNAME || ''}! Te escribo por tu solicitud de cotización de ${CURRENT_LEAD.Categoria || ''} hacia ${CURRENT_LEAD["region-destino"] || ''}`;
      const mensajeEncoded = encodeURIComponent(mensaje);
      
      wspSpan.innerHTML = leadTel 
        ? `<a href="https://wa.me/${leadTel.replace('+', '')}?text=${mensajeEncoded}" target="_blank" style="color: #25D366; text-decoration: none;">${leadTel}</a>` 
        : '';
    } else {
      telSpan.innerText = '';
      wspSpan.innerText = '';
    }
  } else {
    document.getElementById("contacto-box").classList.add("hidden");
    document.getElementById("btn-reclamar").classList.remove("hidden");
  }
}

document.getElementById("volver-dashboard").onclick = () => {
  document.getElementById("lead-view").classList.remove("active");
  // Dashboard view should already be active, just ensure the correct content view is shown
  // The current view should remain active (leads-disponibles or leads-reclamados)
};

document.getElementById("btn-reclamar").onclick = async () => {

  if (!CURRENT_LEAD) {
    alert("Error: Lead no seleccionado.");
    return;
  }

  document.getElementById("btn-reclamar").disabled = true;
  document.getElementById("spinner-reclamar")?.classList?.remove("hidden");

  const res = await api({
    action: "reclamarLead",
    leadId: CURRENT_LEAD.ID,
    email: CURRENT_USER
  });

  document.getElementById("btn-reclamar").disabled = false;
  document.getElementById("spinner-reclamar")?.classList?.add("hidden");

  if (res.ok === false) {
    if (res.error === "INSUFFICIENT_TOKENS") {
      alert("❌ No tienes suficientes tokens. Tienes " + res.tokens + " tokens disponibles.");
      document.getElementById("btn-reclamar").classList.add("hidden");
      return;
    }
    if (res.error === "MAX_CLAIMS_REACHED") {
      alert("❌ Este lead ya alcanzó el máximo de 3 reclamos.");
      document.getElementById("btn-reclamar").classList.add("hidden");
      // document.getElementById("reclamar-info").innerText = "Lead agotado – ya fue reclamado 3 veces.";
    } else if (res.error === "ALREADY_CLAIMED") {
      alert("Ya reclamaste este lead anteriormente.");
      document.getElementById("btn-reclamar").classList.add("hidden");
      // document.getElementById("reclamar-info").innerText = "Ya reclamaste este lead.";
    } else {
      alert("Error al reclamar el lead. Intenta de nuevo.");
    }
    return;
  }

  document.getElementById("contacto-box").classList.remove("hidden");
  document.getElementById("reclamo-msg").classList.remove("hidden");
  document.getElementById("btn-reclamar").classList.add("hidden");
  // document.getElementById("reclamar-info").classList.add("hidden");

  document.getElementById("lead-nombre").innerText = CURRENT_LEAD.FNAME || '';
  // Completar email
  const leadEmail = CURRENT_LEAD.EMAIL || '';
  const emailSpan = document.getElementById("lead-email");

  if (leadEmail) {
    emailSpan.innerHTML = `<a href="mailto:${leadEmail}" style="color: #007bff; text-decoration: none;">${leadEmail}</a>`;
  } else {
    emailSpan.innerText = '';
  }
  // Completar teléfono
  const leadTel = normalizarTelefono(CURRENT_LEAD.TEL);
  const telSpan = document.getElementById("lead-tel");
  const wspSpan = document.getElementById("lead-wsp");
  
  if (leadTel) {
    telSpan.innerHTML = leadTel 
    ? `<a href="tel:${leadTel}" style="color: #007bff; text-decoration: none;">${leadTel}</a>` 
    : '';

    const mensaje = `Hola ${CURRENT_LEAD.FNAME || ''}! Te escribo por tu solicitud de cotización de ${CURRENT_LEAD.Categoria || ''} hacia ${CURRENT_LEAD["region-destino"] || ''}`;
    const mensajeEncoded = encodeURIComponent(mensaje);
    
    wspSpan.innerHTML = leadTel 
      ? `<a href="https://wa.me/${leadTel.replace('+', '')}?text=${mensajeEncoded}" target="_blank" style="color: #25D366; text-decoration: none;">${leadTel}</a>` 
      : '';
  } else {
    telSpan.innerText = '';
    wspSpan.innerText = '';
  }

  // Actualizar tokens
  if (res.tokens !== undefined) {
    USER_TOKENS = res.tokens;
    const tokenDisplay = document.getElementById("user-tokens");
    if (tokenDisplay) {
      tokenDisplay.innerText = USER_TOKENS;
    }
  }

  await loadReclamados();
  await loadLeads();
  
  setTimeout(async () => {
    await loadLeads();
  }, 500);
};

// =======================================================
// PUSH NOTIFICATIONS — FCM + SERVICE WORKER
// =======================================================

const VAPID_PUBLIC_KEY = 'TU_CLAVE_PUBLICA_VAPID'; // ← de Firebase Console
const NOTIF_DISMISSED_KEY = 'notif_dismissed_until';

// ── Registrar Service Worker ──
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Workers no soportados');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('[SW] registrado:', reg.scope);
    return reg;
  } catch (e) {
    console.error('[SW] error al registrar:', e);
    return null;
  }
}

// ── Obtener token FCM y guardarlo en el backend ──
async function getFCMToken() {
  try {
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ 
      vapidKey: 'BHLpMih9k_BpPPqGaGCiqa_-BbA4_QMiGO4yM5dvU5aB5doEajyUzszznSGKmWirfRBA3julzRYgaxoW7DtUn3s',
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
    });

    if (token) {
      console.log('[FCM] token obtenido:', token.substring(0, 20) + '...');
      console.log('[FCM] guardando token para:', CURRENT_USER);
      const res = await api({ action: 'saveFcmToken', email: CURRENT_USER, token });
      console.log('[FCM] token guardado:', res);
      return token;
    } else {
      console.warn('[FCM] no se obtuvo token');
      return null;
    }
  } catch(e) {
    console.error('[FCM] error obteniendo token:', e);
    return null;
  }
}

// ── Notificación cuando la pestaña está ABIERTA ──
function listenForegroundMessages() {
  const messaging = firebase.messaging();
  messaging.onMessage(async (payload) => {
    console.log('[FCM] mensaje foreground:', payload);
    const title = payload.notification?.title || '🚛 Nuevo lead';
    const body  = payload.notification?.body  || '';

    // Enviar mensaje al SW para que muestre la notificación
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.active) {
      reg.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        body,
        url: payload.data?.url || 'https://chiletransportistas.com'
      });
    }

    loadLeads();
  });
}

function shouldShowNotifModal() {
  const dismissedUntil = localStorage.getItem(NOTIF_DISMISSED_KEY);
  if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return false;
  return true;
}

// ── Flujo principal: pedir permiso → obtener token → escuchar ──
async function initPushNotifications() {
  await registerSW();

  if (Notification.permission === 'granted') {
    await getFCMToken();
    listenForegroundMessages();
    return;
  }

  if (Notification.permission === 'denied') {
    showNotifBlockedBanner();
    return;
  }

  // default: preguntar
  if (shouldShowNotifModal()) {
    document.getElementById('notification-modal').classList.remove('hidden');
  }
}

function showNotifModal() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') { showNotifBlockedBanner(); return; }
  if (shouldShowNotifModal()) {
    document.getElementById('notification-modal').classList.remove('hidden');
  }
}

function showNotifBlockedBanner() {
  const banner = document.getElementById('notif-blocked-banner');
  if (banner) banner.classList.remove('hidden');
}

// ── Listeners del modal ──
document.getElementById('btn-notif-accept').addEventListener('click', async () => {
  document.getElementById('notification-modal').classList.add('hidden');
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await getFCMToken();
    listenForegroundMessages();
  } else if (permission === 'denied') {
    showNotifBlockedBanner();
  }
});

document.getElementById('btn-notif-deny').addEventListener('click', () => {
  localStorage.setItem(NOTIF_DISMISSED_KEY, Date.now() + 3 * 24 * 60 * 60 * 1000);
  document.getElementById('notification-modal').classList.add('hidden');
});

// =======================================================
// FILTROS Y ORDENAMIENTO
// =======================================================

// Caché de leads reclamados con datos completos (para filtrar)
let RECLAMADOS_FULL = []; 

function populateFilterOptions(tabla, leads) {
  const suffix = tabla === 'disponibles' ? 'disp' : 'rec';
  const selOrigen = document.getElementById(`filter-origen-${suffix}`);
  const selDestino = document.getElementById(`filter-destino-${suffix}`);
  const selCat = document.getElementById(`filter-categoria-${suffix}`);
  if (!selOrigen) return;

  const origenes = [...new Set(leads.map(l => l["region-origen"]).filter(Boolean))].sort();
  const destinos = [...new Set(leads.map(l => l["region-destino"]).filter(Boolean))].sort();
  const categorias = [...new Set(leads.map(l => l.Categoria).filter(Boolean))].sort();

  const rebuild = (sel, opciones, placeholder) => {
    const current = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    opciones.forEach(op => {
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op;
      if (op === current) opt.selected = true;
      sel.appendChild(opt);
    });
  };

  rebuild(selOrigen, origenes, "Origen: Todos");
  rebuild(selDestino, destinos, "Destino: Todos");
  rebuild(selCat, categorias, "Categoría: Todas");
}

function aplicarFiltros(tabla) {
  const suffix = tabla === 'disponibles' ? 'disp' : 'rec';
  const origen = document.getElementById(`filter-origen-${suffix}`)?.value || '';
  const destino = document.getElementById(`filter-destino-${suffix}`)?.value || '';
  const categoria = document.getElementById(`filter-categoria-${suffix}`)?.value || '';
  const sort = document.getElementById(`sort-${suffix}`)?.value || 'fecha-desc';

  // Marcar selects activos visualmente
  ['origen', 'destino', 'categoria'].forEach(f => {
    const el = document.getElementById(`filter-${f}-${suffix}`);
    if (el) el.classList.toggle('active-filter', !!el.value);
  });

  const fuente = tabla === 'disponibles' ? LEADS : RECLAMADOS_FULL;

  let filtrados = fuente.filter(lead => {
    if (origen && lead["region-origen"] !== origen) return false;
    if (destino && lead["region-destino"] !== destino) return false;
    if (categoria && lead.Categoria !== categoria) return false;
    return true;
  });

  // Ordenar
  filtrados.sort((a, b) => {
    if (sort === 'fecha-asc') return new Date(a["CREATED ON"]) - new Date(b["CREATED ON"]);
    if (sort === 'fecha-desc') return new Date(b["CREATED ON"]) - new Date(a["CREATED ON"]);
    if (sort === 'categoria-asc') return (a.Categoria || '').localeCompare(b.Categoria || '');
    return 0;
  });

  if (tabla === 'disponibles') {
    renderLeadsTable(filtrados);
  } else {
    renderReclamadosTable(filtrados);
  }
}

function limpiarFiltros(tabla) {
  const suffix = tabla === 'disponibles' ? 'disp' : 'rec';
  ['origen', 'destino', 'categoria'].forEach(f => {
    const el = document.getElementById(`filter-${f}-${suffix}`);
    if (el) { el.value = ''; el.classList.remove('active-filter'); }
  });
  const sortEl = document.getElementById(`sort-${suffix}`);
  if (sortEl) sortEl.value = 'fecha-desc';
  aplicarFiltros(tabla);
}

// =======================================================
// RENDER FUNCTIONS (extraídas para reutilizar con filtros)
// =======================================================

function formatFecha(raw) {
  try {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch(e) { return raw; }
}

function renderLeadsTable(leads) {
  const tbody = document.querySelector("#tabla-disponibles tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay leads que coincidan con los filtros.</td></tr>';
    return;
  }

  leads.forEach(lead => {
    if (!lead.ID || String(lead.ID).trim() === "") return;
    const tr = document.createElement("tr");
    const mensaje = String(lead.MESSAGE || '').slice(0, 50);
    tr.innerHTML = `
      <td class="mobile-hidden">${formatFecha(lead["CREATED ON"])}</td>
      <td>${mensaje}${mensaje.length >= 50 ? '...' : ''}</td>
      <td>${lead["region-origen"] || ''}</td>
      <td>${lead["region-destino"] || ''}</td>
      <td>${lead.Categoria || ''}</td>
      <td><button class="primary" onclick="verLead('${lead.ID}')">Ver</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderReclamadosTable(reclamados) {
  const tbody = document.querySelector("#tabla-reclamados tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (reclamados.length === 0) {
    document.getElementById("mensaje-leads-no-reclamados")?.classList.remove('hidden');
    return;
  }

  document.getElementById("mensaje-leads-no-reclamados")?.classList.add('hidden');

  reclamados.forEach(lead => {
    const tr = document.createElement("tr");
    const mensaje = String(lead.MESSAGE || '').slice(0, 50);
    tr.innerHTML = `
      <td class="mobile-hidden">${formatFecha(lead.fecha_reclamo)}</td>
      <td>${mensaje}${mensaje.length >= 50 ? '...' : ''}</td>
      <td>${lead["region-origen"] || ''}</td>
      <td>${lead["region-destino"] || ''}</td>
      <td>${lead.Categoria || ''}</td>
      <td><button class="primary" onclick="verLeadReclamado('${lead.ID}')">Ver</button></td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => verLeadReclamado(lead.ID));
    tbody.appendChild(tr);
  });
}

// =======================================================
// ONBOARDING INTERACTIVO
// =======================================================
const ONBOARDING_KEY = 'cht_onboarding_v1';
let obStep = 0;
let obSidebarExpanded = false;

const OB_STEPS = [
  {
    icon: '👋',
    title: '¡Bienvenido a ChileTransportistas!',
    body: 'Eres parte de la red de transporte más conectada de Chile. En 2 minutos te mostramos cómo funciona.',
    target: null
  },
  {
    icon: '📋',
    title: 'Leads disponibles',
    body: 'Solicitudes reales de empresas buscando transporte. Frescos — máximo 5 días — y disponibles para hasta 3 transportistas.',
    target: '[data-view="leads-disponibles"]',
    placement: 'right',
    needsSidebar: true
  },
  {
    icon: '🎯',
    title: 'Reclama un lead',
    body: 'Haz clic en "Ver" para revisar los detalles. Si te interesa, reclámalo y obtienes nombre, email y teléfono del cliente al instante.',
    target: '#tabla-disponibles',
    placement: 'top'
  },
  {
    icon: '🪙',
    title: 'Tus tokens',
    body: '¡Tienes 5 tokens gratis para empezar! Cada lead que reclamas cuesta 1 token. Consigue más en la sección Planes.',
    target: '.sidebar-user-tokens',
    placement: 'right',
    needsSidebar: true
  },
  {
    icon: '🔍',
    title: 'Filtra por lo que importa',
    body: 'Usa los filtros de origen, destino y categoría para ver solo los leads que calzan con tu operación.',
    target: '#filter-bar-disponibles',
    placement: 'bottom'
  },
  {
    icon: '🚀',
    title: '¡Listo para empezar!',
    body: 'Ya tienes todo lo que necesitas. Reclama tu primer lead y contacta a tu próximo cliente hoy mismo.',
    target: null
  }
];

// ── Expansión del sidebar para pasos que lo necesitan ──
function obExpandSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('collapsed') || sidebar.classList.contains('closed')) {
    obSidebarExpanded = true;
    sidebar.classList.remove('collapsed', 'closed');
  }
}

function obRestoreSidebar() {
  if (!obSidebarExpanded) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth > 768) {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.add('closed');
  }
  obSidebarExpanded = false;
}

// ── Posicionamiento del spotlight + tooltip ──
function obPosition(step) {
  const spotlight = document.getElementById('ob-spotlight');
  const tooltip   = document.getElementById('ob-tooltip');
  const arrow     = document.getElementById('ob-arrow');
  const overlay   = document.getElementById('ob-overlay');

  const vw  = window.innerWidth;
  const vh  = window.innerHeight;
  const M   = 12;
  const PAD = 8;
  const GAP = 14;
  const TH  = 260;

  // ── En móvil: ancho dinámico pegado a los bordes ──
  const TW = vw <= 768 ? vw - M * 2 : 300;
  tooltip.style.width = TW + 'px';

  overlay.classList.remove('hidden');
  tooltip.classList.remove('hidden');

  // ── Sin target: centrado en viewport ──
  if (!step.target) {
    spotlight.classList.add('hidden');
    tooltip.style.cssText = `
      position: fixed;
      top: ${Math.round(vh / 2 - TH / 2)}px;
      left: ${M}px;
      width: ${TW}px;
    `;
    arrow.className = 'ob-arrow';
    return;
  }

  if (step.needsSidebar) obExpandSidebar();

  setTimeout(() => {
    const targetEl = document.querySelector(step.target);
    if (!targetEl) { obPosition({ ...step, target: null }); return; }

    const r   = targetEl.getBoundingClientRect();
    const M   = 12;
    const PAD = 8;
    const GAP = 14;
    const TW  = 300;
    const TH  = 260;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;

    // Spotlight
    const sTop  = r.top    - PAD;
    const sLeft = r.left   - PAD;
    const sW    = r.width  + PAD * 2;
    const sH    = r.height + PAD * 2;

    spotlight.classList.remove('hidden');
    spotlight.style.top    = sTop  + 'px';
    spotlight.style.left   = sLeft + 'px';
    spotlight.style.width  = sW    + 'px';
    spotlight.style.height = sH    + 'px';

    // Placement automático en móvil
    let placement = step.placement || 'auto';
    if (vw <= 768) {
      placement = (r.top + r.height / 2 < vh / 2) ? 'bottom' : 'top';
    }

    // Calcular posición base en píxeles puros
    let ttTop, ttLeft, arrowClass;

    switch (placement) {
      case 'right':
        ttLeft     = sLeft + sW + GAP;
        ttTop      = sTop + sH / 2 - TH / 2;
        arrowClass = 'arrow-left';
        break;
      case 'left':
        ttLeft     = sLeft - TW - GAP;
        ttTop      = sTop + sH / 2 - TH / 2;
        arrowClass = 'arrow-right';
        break;
      case 'bottom':
        ttTop      = sTop + sH + GAP;
        ttLeft     = sLeft + sW / 2 - TW / 2;
        arrowClass = 'arrow-top';
        break;
      case 'top':
      default:
        ttTop      = sTop - TH - GAP;
        ttLeft     = sLeft + sW / 2 - TW / 2;
        arrowClass = 'arrow-bottom';
        break;
    }

    // Clamp vertical (aplica tanto móvil como desktop)
    ttTop = Math.max(M, Math.min(ttTop, vh - TH - M));

    // En móvil: left/right fijos, CSS maneja el ancho
    if (vw <= 768) {
      tooltip.style.cssText = `
        position: fixed;
        top: ${Math.round(ttTop)}px;
        left: 12px;
        right: 12px;
        width: auto;
        transition: top 0.45s cubic-bezier(0.16,1,0.3,1);
      `;
      arrow.className = 'ob-arrow ' + arrowClass;
      return;
    }

    // Desktop: clamp horizontal y posición fija en px
    ttLeft = Math.max(M, Math.min(ttLeft, vw - TW - M));

    tooltip.style.cssText = `
      position: fixed;
      top: ${Math.round(ttTop)}px;
      left: ${Math.round(ttLeft)}px;
      width: ${TW}px;
      transition: top 0.45s cubic-bezier(0.16,1,0.3,1), left 0.45s cubic-bezier(0.16,1,0.3,1);
    `;
    arrow.className = 'ob-arrow ' + arrowClass;

  }, step.needsSidebar ? 320 : 0);
}

// ── Render de cada paso ──
function renderObStep() {
  const step  = OB_STEPS[obStep];
  const total = OB_STEPS.length;

  document.getElementById('ob-icon').textContent  = step.icon;
  document.getElementById('ob-title').textContent = step.title;
  document.getElementById('ob-body').textContent  = step.body;
  document.getElementById('ob-badge').textContent = `Paso ${obStep + 1} de ${total}`;

  const dotsEl = document.getElementById('ob-dots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'ob-dot' + (i === obStep ? ' active' : i < obStep ? ' done' : '');
    dotsEl.appendChild(d);
  }

  document.getElementById('btn-ob-prev').style.visibility =
    obStep === 0 ? 'hidden' : 'visible';
  document.getElementById('btn-ob-next').textContent =
    obStep === total - 1 ? '¡Empezar! 🚀' : 'Siguiente →';

  obPosition(step);
}

async function checkOnboarding() {
  // Primero revisar localStorage como cache rápido
  const localKey = ONBOARDING_KEY + '_' + CURRENT_USER;
  if (localStorage.getItem(localKey)) {
    return false; // ya visto
  }

  // Verificar en el servidor (fuente de verdad)
  try {
    const res = await api({ action: "getOnboardingDone", email: CURRENT_USER });
    if (res.done) {
      // Guardar en cache local para no volver a consultar
      localStorage.setItem(localKey, '1');
      return false;
    }
  } catch (e) {
    console.error("Error checking onboarding:", e);
  }

  // Primera vez: arrancar tutorial
  obStep = 0;
  renderObStep();
  return true;
}

async function finishOnboarding() {
  // Guardar en servidor
  api({ action: "setOnboardingDone", email: CURRENT_USER });

  // Guardar en cache local
  localStorage.setItem(ONBOARDING_KEY + '_' + CURRENT_USER, '1');

  ['ob-overlay', 'ob-spotlight', 'ob-tooltip'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );
  obRestoreSidebar();
  showNotifModal();
}

// ── Listeners ──
document.getElementById('btn-ob-next').addEventListener('click', () => {
  // Colapsar sidebar si el siguiente paso no lo necesita
  if (!OB_STEPS[obStep + 1]?.needsSidebar && obSidebarExpanded) {
    obRestoreSidebar();
  }
  if (obStep >= OB_STEPS.length - 1) {
    finishOnboarding();
  } else {
    obStep++;
    renderObStep();
  }
});

document.getElementById('btn-ob-prev').addEventListener('click', () => {
  if (obStep <= 0) return;
  obStep--;
  renderObStep();
});

document.getElementById('btn-ob-skip').addEventListener('click', finishOnboarding);

// Reposicionar si cambia el tamaño de ventana
window.addEventListener('resize', () => {
  if (!document.getElementById('ob-tooltip').classList.contains('hidden')) {
    obPosition(OB_STEPS[obStep]);
  }
});