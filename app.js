const API = "https://script.google.com/macros/s/AKfycbxtYnF03s9lFWAXtFEhtwnAPZZaePG0ur85kR-vMT7Iv-OC6Kfj-USLb3myVgzm1KCQ/exec";

let CURRENT_USER = null;
let LEADS = [];
let RECLAMADOS = [];
let CURRENT_LEAD = null;

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

// =========================
// VALIDACIÃ“N DE EMAIL
// =========================
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// =========================
// SANITIZACIÃ“N
// =========================
function sanitizeInput(input) {
  if (!input) return '';
  return String(input).trim().slice(0, 500); // Limitar longitud
}

// =======================================================
// LOGIN
// =======================================================
document.addEventListener("DOMContentLoaded", () => {

  const btnLogin = document.getElementById("btn-login");
  const btnRegistrar = document.getElementById("btn-registrar");
  const btnValidarCodigo = document.getElementById("btn-validar-codigo");

  if (!btnLogin || !btnRegistrar || !btnValidarCodigo) {
    console.error("âŒ ERROR: Hay elementos que NO existen en el HTML.");
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
      loginError.innerText = "Ingresa un correo vÃ¡lido.";
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
      return;
    }

    // ValidaciÃ³n de correo
    if (res.validador !== true && res.validador !== "true") {
      document.getElementById("login-hero-container").style.display = 'none';
      document.getElementById("login-view").classList.remove("active");
      document.getElementById("validacion-view").classList.add("active");
      document.getElementById("email-validacion").innerText = email;
      return;
    }

    // Inicio de sesiÃ³n
    CURRENT_USER = email;
    startDashboard();
  };

  document.getElementById("login-email").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      btnLogin.click();
    }
  });

  // =======================================================
  // REGISTRO
  // =======================================================
  btnRegistrar.onclick = async () => {
    const email = sanitizeInput(document.getElementById("email-register").value);
    const nombre = sanitizeInput(document.getElementById("reg-nombre").value);
    const apellido = sanitizeInput(document.getElementById("reg-apellido").value);
    const loginError = document.getElementById("login-error");

    loginError.innerText = "";

    if (!email || !nombre || !apellido) {
      loginError.innerText = "Completa todos los campos.";
      return;
    }

    if (!isValidEmail(email)) {
      loginError.innerText = "Email invÃ¡lido.";
      return;
    }

    if (nombre.length < 2 || apellido.length < 2) {
      loginError.innerText = "Nombre y apellido deben tener al menos 2 caracteres.";
      return;
    }

    btnRegistrar.disabled = true;
    document.getElementById("spinner-registrar").style.display = 'flex';

    const res = await api({ action: "register", email, nombre, apellido });

    btnRegistrar.disabled = false;
    document.getElementById("spinner-registrar").style.display = 'none';

    if (res.error) {
      loginError.innerText = "Error al registrar. El email podrÃ­a estar en uso.";
      return;
    }

    document.getElementById("login-hero-container").style.display = 'none';
    document.getElementById("login-view").classList.remove("active");
    document.getElementById("validacion-view").classList.add("active");
    document.getElementById("email-validacion").innerText = email;
  };

  // =======================================================
  // VALIDAR CÃ“DIGO
  // =======================================================
  btnValidarCodigo.onclick = async () => {
    const email = sanitizeInput(document.getElementById("email-validacion").innerText);
    const codigo = sanitizeInput(document.getElementById("input-codigo").value);
    const msg = document.getElementById("validacion-error");

    msg.innerText = "";

    if (!codigo) {
      msg.innerText = "Ingresa tu cÃ³digo.";
      return;
    }

    if (!/^\d{6}$/.test(codigo)) {
      msg.innerText = "El cÃ³digo debe ser de 6 dÃ­gitos.";
      return;
    }

    btnValidarCodigo.disabled = true;
    const res = await api({ action: "validate", email, codigo });
    btnValidarCodigo.disabled = false;

    if (!res.ok) {
      msg.innerText = "CÃ³digo incorrecto.";
      return;
    }

    CURRENT_USER = email;
    startDashboard();
  };

}); // DOMContentLoaded END

// =======================================================
// DASHBOARD
// =======================================================
async function startDashboard() {
  document.getElementById("login-hero-container").style.display = 'none';
  document.getElementById("login-topbar").style.display = 'none';
  document.getElementById("login-view").classList.remove("active");
  document.getElementById("dashboard-view").classList.add("active");

  document.getElementById("user-email").innerText = CURRENT_USER;

  document.getElementById("spinner-disponibles").style.display = "flex";

  await loadLeads();
  await loadReclamados();

  document.getElementById("spinner-disponibles").style.display = "none";
}

async function loadLeads() {
  document.getElementById("spinner-disponibles").style.display = "flex";

  LEADS = await api({ action: "getLeads", email: CURRENT_USER });

  if (!Array.isArray(LEADS)) {
    LEADS = [];
  }

  const tbody = document.querySelector("#tabla-disponibles tbody");
  tbody.innerHTML = "";

  if (LEADS.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" style="text-align:center;">No hay leads disponibles en este momento.</td>';
    tbody.appendChild(tr);
  } else {
    LEADS.forEach((lead) => {
      // Validar que el lead tenga un ID vÃ¡lido
      if (!lead.ID || String(lead.ID).trim() === "") {
        return; // Saltar esta fila vacÃ­a
      }

      const tr = document.createElement("tr");

      let fecha = lead["CREATED ON"];
      try {
        let d = new Date(fecha);
        if (!isNaN(d)) {
          let day = String(d.getDate()).padStart(2, '0');
          let month = String(d.getMonth() + 1).padStart(2, '0');
          let year = d.getFullYear();
          fecha = `${day}/${month}/${year}`;
        }
      } catch (e) {}

      const mensaje = String(lead.MESSAGE || '').slice(0, 40);
      const origen = String(lead["region-origen"] || '');
      const destino = String(lead["region-destino"] || '');
      const categoria = String(lead.Categoria || '');

      tr.innerHTML = `
        <td>${fecha}</td>
        <td>${mensaje}...</td>
        <td>${origen}</td>
        <td>${destino}</td>
        <td>${categoria}</td>
        <td><button class="primary" onclick="verLead('${lead.ID}')">Ver</button></td>
      `;

      tbody.appendChild(tr);
    });
  }

  document.getElementById("spinner-disponibles").style.display = "none";
}

async function loadReclamados() {
  document.getElementById("spinner-reclamados").style.display = "flex";

  RECLAMADOS = await api({ action: "getReclamados", email: CURRENT_USER });

  if (!Array.isArray(RECLAMADOS)) {
    RECLAMADOS = [];
  }

  // Obtener todos los leads para mostrar los reclamados (aunque no estÃ©n en disponibles)
  const todosLosLeads = await api({ action: "getAllLeads" });

  const tbody = document.querySelector("#tabla-reclamados tbody");
  tbody.innerHTML = "";

  if (RECLAMADOS.length > 0) {
    RECLAMADOS.forEach((rec) => {
      // Buscar primero en LEADS, si no estÃ¡, buscar en todos
      let lead = LEADS.find(l => l.ID == rec.ID);
      if (!lead) {
        lead = todosLosLeads.find(l => l.ID == rec.ID);
      }
      if (!lead) {
        return;
      }

      const tr = document.createElement("tr");

      let fecha_reclamo = rec.fecha_reclamo;
      try {
        let d = new Date(fecha_reclamo);
        if (!isNaN(d)) {
          let day = String(d.getDate()).padStart(2, '0');
          let month = String(d.getMonth() + 1).padStart(2, '0');
          let year = d.getFullYear();
          fecha_reclamo = `${day}/${month}/${year}`;
        }
      } catch (e) {}

      const mensaje = String(lead.MESSAGE || '').slice(0, 40);
      const origen = String(lead["region-origen"] || '');
      const destino = String(lead["region-destino"] || '');
      const categoria = String(lead.Categoria || '');

      tr.innerHTML = `
        <td>${fecha_reclamo}</td>
        <td>${mensaje}...</td>
        <td>${origen}</td>
        <td>${destino}</td>
        <td>${categoria}</td>
        <td><button class="primary" onclick="verLeadReclamado('${lead.ID}')">Ver</button></td>
      `;

      tr.style.cursor = "pointer";
      tr.addEventListener("click", function(e) {
        // Hacer clic en cualquier parte de la fila, incluyendo el botÃ³n, lleva al detalle del lead
        verLeadReclamado(lead.ID);
      });

      tbody.appendChild(tr);
    });

    document.getElementById("mensaje-leads-no-reclamados").classList.add('hidden');
  } else {
    document.getElementById("mensaje-leads-no-reclamados").classList.remove('hidden');
  }

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
  // Primero buscar en LEADS disponibles
  CURRENT_LEAD = LEADS.find(l => l.ID == id);

  // Si no estÃ¡, necesitamos obtener todos los leads
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
  document.getElementById("dashboard-view").classList.remove("active");
  document.getElementById("lead-view").classList.add("active");

  document.getElementById("lead-title").innerText = `Lead de ${CURRENT_LEAD.Categoria}`;
  document.getElementById("lead-fecha").innerText = CURRENT_LEAD["CREATED ON"];
  document.getElementById("lead-mensaje").innerText = CURRENT_LEAD.MESSAGE;
  document.getElementById("lead-origen").innerText = CURRENT_LEAD["region-origen"];
  document.getElementById("lead-destino").innerText = CURRENT_LEAD["region-destino"];
  document.getElementById("lead-categoria").innerText = CURRENT_LEAD.Categoria;

  document.getElementById("reclamo-msg").classList.add("hidden");
  document.getElementById("spinner-reclamar")?.classList?.add("hidden");

  if (yaReclamado) {
    document.getElementById("contacto-box").classList.remove("hidden");
    document.getElementById("btn-reclamar").classList.add("hidden");
    document.getElementById("reclamar-info").classList.add("hidden");

    document.getElementById("lead-nombre").innerText = CURRENT_LEAD.FNAME || '';
    document.getElementById("lead-email").innerText = CURRENT_LEAD.EMAIL || '';
    document.getElementById("lead-tel").innerText = CURRENT_LEAD.TEL || '';
  } else {
    document.getElementById("contacto-box").classList.add("hidden");
    document.getElementById("btn-reclamar").classList.remove("hidden");
    document.getElementById("reclamar-info").classList.remove("hidden");
  }
}

document.getElementById("volver-dashboard").onclick = () => {
  document.getElementById("lead-view").classList.remove("active");
  document.getElementById("dashboard-view").classList.add("active");
};

document.getElementById("logout").onclick = () => {
  CURRENT_USER = null;
  LEADS = [];
  RECLAMADOS = [];
  CURRENT_LEAD = null;
  location.reload();
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
    if (res.error === "MAX_CLAIMS_REACHED") {
      alert("âŒ Este lead ya alcanzÃ³ el mÃ¡ximo de 3 reclamos.");
      document.getElementById("btn-reclamar").classList.add("hidden");
      document.getElementById("reclamar-info").innerText = "Lead agotado â€” ya fue reclamado 3 veces.";
    } else if (res.error === "ALREADY_CLAIMED") {
      alert("Ya reclamaste este lead anteriormente.");
      document.getElementById("btn-reclamar").classList.add("hidden");
      document.getElementById("reclamar-info").innerText = "Ya reclamaste este lead.";
    } else {
      alert("Error al reclamar el lead. Intenta de nuevo.");
    }
    return;
  }

  // Mostrar informaciÃ³n de contacto
  document.getElementById("contacto-box").classList.remove("hidden");
  document.getElementById("reclamo-msg").classList.remove("hidden");
  document.getElementById("btn-reclamar").classList.add("hidden");
  document.getElementById("reclamar-info").classList.add("hidden");

  document.getElementById("lead-nombre").innerText = CURRENT_LEAD.FNAME || '';
  document.getElementById("lead-email").innerText = CURRENT_LEAD.EMAIL || '';
  document.getElementById("lead-tel").innerText = CURRENT_LEAD.TEL || '';

  // Recargar leads y reclamados
  await loadReclamados();
  await loadLeads();
  
  // Agregar un pequeÃ±o delay para asegurar que la base de datos se actualizÃ³
  setTimeout(async () => {
    await loadLeads();
  }, 500);
};
