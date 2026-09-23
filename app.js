const KEYS = {
  members: "trip_members",
  houses: "trip_houses",
  transport: "trip_transport",
  shopping: "trip_shopping",
  activities: "trip_activities",
  itinerary: "trip_itinerary",
  syncStamp: "trip_sync_stamp"
};

const FALLBACKS = {
  house: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80",
  activity: "https://images.unsplash.com/photo-1521334884684-d80222895322?auto=format&fit=crop&w=1200&q=80"
};

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem(KEYS.syncStamp, String(Date.now()));
}

function money(num) {
  return `${Number(num || 0).toFixed(2)} EUR`;
}

function uid() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fileToDataUrl(file) {
  if (!file) {
    return null;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function summary() {
  const members = read(KEYS.members, []);
  const houses = read(KEYS.houses, []);
  const transport = read(KEYS.transport, { total: 0 });
  const shopping = read(KEYS.shopping, []);
  const activities = read(KEYS.activities, []);
  const itinerary = read(KEYS.itinerary, []);

  const houseWinner = [...houses].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))[0];
  const totalShopping = shopping.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const totalActivities = activities.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const total = Number(transport.total || 0) + totalShopping + totalActivities + Number(houseWinner?.price || 0);

  return {
    members,
    houses,
    activities,
    itinerary,
    shopping,
    transport,
    houseWinner,
    total,
    perPerson: total / Math.max(members.length, 1)
  };
}

function calculateSettlements() {
  const members = read(KEYS.members, []);
  const houses = read(KEYS.houses, []);
  const shopping = read(KEYS.shopping, []);
  const transport = read(KEYS.transport, { total: 0, payer: "Fondo comun" });

  const winner = [...houses].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))[0];
  const expenses = [];

  if (winner && Number(winner.price || 0) > 0) {
    expenses.push({ label: "Casa", amount: Number(winner.price || 0), payer: winner.payer || "Fondo comun" });
  }
  if (Number(transport.total || 0) > 0) {
    expenses.push({ label: "Transporte", amount: Number(transport.total || 0), payer: transport.payer || "Fondo comun" });
  }
  shopping.forEach((item) => {
    if (Number(item.price || 0) > 0) {
      expenses.push({ label: item.name || "Compra", amount: Number(item.price || 0), payer: item.payer || "Fondo comun" });
    }
  });

  const ledger = {};
  members.forEach((m) => {
    ledger[m] = 0;
  });

  if (members.length === 0) {
    return { balances: [], transfers: [] };
  }

  expenses.forEach((expense) => {
    const share = expense.amount / members.length;
    members.forEach((member) => {
      ledger[member] -= share;
    });

    if (ledger[expense.payer] !== undefined) {
      ledger[expense.payer] += expense.amount;
    }
  });

  const creditors = [];
  const debtors = [];
  const balances = members.map((name) => ({ name, amount: round2(ledger[name]) }));

  balances.forEach((entry) => {
    if (entry.amount > 0.009) {
      creditors.push({ ...entry });
    }
    if (entry.amount < -0.009) {
      debtors.push({ name: entry.name, amount: Math.abs(entry.amount) });
    }
  });

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = round2(Math.min(debtor.amount, creditor.amount));

    if (pay > 0) {
      transfers.push({ from: debtor.name, to: creditor.name, amount: pay });
    }

    debtor.amount = round2(debtor.amount - pay);
    creditor.amount = round2(creditor.amount - pay);

    if (debtor.amount <= 0.009) {
      i += 1;
    }
    if (creditor.amount <= 0.009) {
      j += 1;
    }
  }

  return { balances, transfers };
}

function getActivityOverview(activities, itinerary) {
  const sortedActivities = [...activities].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
  const topActivities = sortedActivities.slice(0, 3).map((item) => ({
    name: item.name,
    votes: (item.votes || []).length,
    category: item.category || "General"
  }));

  const mapByDay = {};
  itinerary.forEach((item) => {
    const date = item.date || "Sin fecha";
    if (!mapByDay[date]) {
      mapByDay[date] = { date, blocks: 0, done: 0, pending: 0, timeSlots: [] };
    }
    mapByDay[date].blocks += 1;
    if (item.done) {
      mapByDay[date].done += 1;
    } else {
      mapByDay[date].pending += 1;
    }
    if (item.time) {
      mapByDay[date].timeSlots.push(item.time);
    }
  });

  const days = Object.values(mapByDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      let load = "Relax";
      if (day.blocks >= 5) {
        load = "Intenso";
      } else if (day.blocks >= 3) {
        load = "Equilibrado";
      }
      day.timeSlots.sort();
      return {
        ...day,
        load,
        firstSlot: day.timeSlots[0] || "--:--",
        lastSlot: day.timeSlots[day.timeSlots.length - 1] || "--:--"
      };
    });

  const votedCount = sortedActivities.filter((item) => (item.votes || []).length > 0).length;

  return {
    totalActivities: activities.length,
    votedActivities: votedCount,
    totalDays: days.length,
    totalBlocks: itinerary.length,
    topActivities,
    days
  };
}

function printReportHtml(html, title) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  const frameDoc = frame.contentWindow?.document;
  if (!frameDoc || !frame.contentWindow) {
    frame.remove();
    const tab = window.open("", "_blank");
    if (!tab) {
      alert("No se pudo abrir el informe para imprimir. Revisa el bloqueo de ventanas emergentes.");
      return;
    }
    tab.document.write(html);
    tab.document.title = title;
    tab.document.close();
    setTimeout(() => {
      tab.focus();
      tab.print();
    }, 700);
    return;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      setTimeout(() => frame.remove(), 1500);
    }
  }, 700);
}

function exportPlanToPdf(mode = "detailed") {
  const data = summary();
  const settlement = calculateSettlements();
  const activityOverview = getActivityOverview(data.activities, data.itinerary);
  const isCompact = mode === "compact";
  const winnerName = data.houseWinner ? data.houseWinner.name : "Sin casa ganadora";
  const winnerRange = data.houseWinner
    ? (data.houseWinner.dateFrom && data.houseWinner.dateTo
      ? `${data.houseWinner.dateFrom} a ${data.houseWinner.dateTo}`
      : "Sin fechas definidas")
    : "Sin fechas";
  const winnerPrice = data.houseWinner ? money(data.houseWinner.price) : "0.00 EUR";

  const balanceRows = settlement.balances.length
    ? settlement.balances.map((entry) => {
      const status = entry.amount >= 0 ? "A favor" : "A pagar";
      return `<tr><td>${escapeHtml(entry.name)}</td><td>${status}</td><td>${money(Math.abs(entry.amount))}</td></tr>`;
    }).join("")
    : '<tr><td colspan="3">Sin asistentes aún</td></tr>';

  const dayRows = activityOverview.days.length
    ? activityOverview.days.map((day) => `
      <tr>
        <td>${escapeHtml(day.date)}</td>
        <td>${day.blocks}</td>
        <td>${day.done}</td>
        <td>${day.pending}</td>
        <td>${escapeHtml(day.load)}</td>
        <td>${escapeHtml(day.firstSlot)} - ${escapeHtml(day.lastSlot)}</td>
      </tr>`).join("")
    : '<tr><td colspan="6">Sin itinerario todavía</td></tr>';

  const topRows = activityOverview.topActivities.length
    ? activityOverview.topActivities.map((item, idx) => `<tr><td>#${idx + 1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category)}</td><td>${item.votes}</td></tr>`).join("")
    : '<tr><td colspan="4">Sin actividades votadas aún</td></tr>';

  const transferRows = settlement.transfers.length
    ? settlement.transfers.map((move) => `<li>${escapeHtml(move.from)} paga a ${escapeHtml(move.to)}: <strong>${money(move.amount)}</strong></li>`).join("")
    : "<li>Todo equilibrado, sin transferencias.</li>";

  const transferRowsCompact = settlement.transfers.length
    ? settlement.transfers.slice(0, 4).map((move) => `<li>${escapeHtml(move.from)} -> ${escapeHtml(move.to)}: <strong>${money(move.amount)}</strong></li>`).join("")
    : "<li>Sin transferencias pendientes.</li>";

  const topRowsCompact = activityOverview.topActivities.length
    ? activityOverview.topActivities.slice(0, 3).map((item, idx) => `<tr><td>#${idx + 1}</td><td>${escapeHtml(item.name)}</td><td>${item.votes}</td></tr>`).join("")
    : '<tr><td colspan="3">Sin votos todavía</td></tr>';

  const dayRowsCompact = activityOverview.days.length
    ? activityOverview.days.slice(0, 4).map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${day.blocks}</td><td>${escapeHtml(day.load)}</td></tr>`).join("")
    : '<tr><td colspan="3">Sin días planificados</td></tr>';

  const html = isCompact ? `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Informe Birra & Brujula - Compacto</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body { width: 100%; }
      body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2b1f; margin: 0; }
      .cover {
        border-radius: 12px;
        padding: 18px;
        background: linear-gradient(130deg, #1f4d2d 0%, #2f6a3f 45%, #7c9f4f 100%);
        color: #f4f6ef;
      }
      .cover h1 { margin: 0; font-size: 24px; }
      .cover p { margin: 6px 0 0; font-size: 12px; opacity: 0.95; }
      .meta { margin-top: 8px; font-size: 11px; opacity: 0.9; }
      .kpis { margin-top: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .box { border: 1px solid #dce5d8; border-radius: 10px; padding: 8px; }
      .label { font-size: 10px; color: #5f6b60; text-transform: uppercase; }
      .value { font-weight: 700; margin-top: 3px; font-size: 13px; }
      .grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .card { border: 1px solid #dce5d8; border-radius: 10px; padding: 8px; }
      h2 { margin: 0 0 6px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e0e4dc; padding: 5px; font-size: 11px; }
      th { background: #f2f6ee; }
      ul { margin: 0; padding-left: 16px; }
      li { font-size: 11px; margin-bottom: 4px; }
      .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        table, tr, td, th, .cover, .card {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <section class="cover">
      <h1>Informe compacto del viaje</h1>
      <p>Resumen rápido para compartir en 1 página.</p>
      <div class="meta">Generado el ${new Date().toLocaleString("es-ES")}</div>
    </section>

    <section class="kpis">
      <div class="box"><div class="label">Asistentes</div><div class="value">${data.members.length}</div></div>
      <div class="box"><div class="label">Casa</div><div class="value">${escapeHtml(winnerName)}</div></div>
      <div class="box"><div class="label">Total</div><div class="value">${money(data.total)}</div></div>
      <div class="box"><div class="label">Por persona</div><div class="value">${money(data.perPerson)}</div></div>
    </section>

    <section class="grid avoid-break">
      <article class="card avoid-break">
        <h2>Liquidación sugerida</h2>
        <ul>${transferRowsCompact}</ul>
      </article>
      <article class="card avoid-break">
        <h2>Top actividades</h2>
        <table>
          <thead><tr><th>Pos</th><th>Actividad</th><th>Votos</th></tr></thead>
          <tbody>${topRowsCompact}</tbody>
        </table>
      </article>
    </section>

    <section class="card avoid-break" style="margin-top:10px;">
      <h2>Plan por días</h2>
      <table>
        <thead><tr><th>Día</th><th>Bloques</th><th>Carga</th></tr></thead>
        <tbody>${dayRowsCompact}</tbody>
      </table>
    </section>
  </body>
  </html>` : `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Informe Birra & Brujula</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      html, body { width: 100%; }
      body {
        font-family: "Segoe UI", Arial, sans-serif;
        color: #1f2b1f;
        margin: 0;
        background: #fff;
      }
      .cover {
        border-radius: 16px;
        padding: 26px;
        background: linear-gradient(130deg, #1f4d2d 0%, #2f6a3f 45%, #7c9f4f 100%);
        color: #f4f6ef;
      }
      .cover h1 { margin: 0; font-size: 30px; letter-spacing: 0.4px; }
      .cover p { margin: 8px 0 0; opacity: 0.95; font-size: 14px; }
      .cover-meta {
        margin-top: 14px;
        display: inline-block;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 12px;
      }
      .section { margin-top: 18px; }
      h2 {
        margin: 0 0 10px;
        font-size: 17px;
        border-left: 5px solid #2f6a3f;
        padding-left: 9px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }
      .box {
        border: 1px solid #d6dfd1;
        border-radius: 12px;
        padding: 11px;
        background: #f8fbf4;
      }
      .label { color: #586458; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
      .value { font-weight: 700; font-size: 16px; margin-top: 5px; }
      .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .card {
        border: 1px solid #dfe6dc;
        border-radius: 12px;
        padding: 11px;
        background: #fff;
      }
      table { width: 100%; border-collapse: collapse; }
      th, td {
        border: 1px solid #e0e4dc;
        padding: 7px 8px;
        text-align: left;
        font-size: 12px;
      }
      th { background: #f2f6ee; color: #2d4731; }
      ul { margin: 0; padding-left: 19px; }
      li { margin-bottom: 5px; }
      .muted { color: #5c6a5f; font-size: 12px; }
      .footer {
        margin-top: 18px;
        text-align: right;
        color: #6a746a;
        font-size: 11px;
      }
      .avoid-break { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        table, tr, td, th, .cover, .card {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <section class="cover">
      <h1>Informe Birra & Brujula</h1>
      <p>Resumen ejecutivo del finde con amigos: gastos, liquidación e itinerario.</p>
      <span class="cover-meta">Generado el ${new Date().toLocaleString("es-ES")}</span>
    </section>

    <section class="section">
      <div class="kpis">
        <div class="box"><div class="label">Asistentes</div><div class="value">${data.members.length}</div></div>
        <div class="box"><div class="label">Casa ganadora</div><div class="value">${escapeHtml(winnerName)}</div></div>
        <div class="box"><div class="label">Presupuesto total</div><div class="value">${money(data.total)}</div></div>
        <div class="box"><div class="label">Coste por persona</div><div class="value">${money(data.perPerson)}</div></div>
      </div>
    </section>

    <section class="section two-col avoid-break">
      <article class="card avoid-break">
        <h2>Datos de alojamiento</h2>
        <p><strong>Casa:</strong> ${escapeHtml(winnerName)}</p>
        <p><strong>Fechas:</strong> ${escapeHtml(winnerRange)}</p>
        <p><strong>Coste:</strong> ${winnerPrice}</p>
      </article>
      <article class="card avoid-break">
        <h2>Actividad global</h2>
        <p><strong>Propuestas:</strong> ${activityOverview.totalActivities}</p>
        <p><strong>Con votos:</strong> ${activityOverview.votedActivities}</p>
        <p><strong>Bloques en itinerario:</strong> ${activityOverview.totalBlocks}</p>
      </article>
    </section>

    <section class="section two-col avoid-break">
      <article class="card avoid-break">
        <h2>Liquidación sugerida</h2>
        <ul>${transferRows}</ul>
      </article>
      <article class="card avoid-break">
        <h2>Balance por persona</h2>
        <table>
          <thead><tr><th>Persona</th><th>Estado</th><th>Importe</th></tr></thead>
          <tbody>${balanceRows}</tbody>
        </table>
      </article>
    </section>

    <section class="section avoid-break">
      <h2>Top actividades por votos</h2>
      <table>
        <thead><tr><th>Posición</th><th>Actividad</th><th>Categoría</th><th>Votos</th></tr></thead>
        <tbody>${topRows}</tbody>
      </table>
    </section>

    <section class="section avoid-break">
      <h2>Plan por días</h2>
      <p class="muted">Vista de carga diaria para detectar jornadas intensas o huecos de descanso.</p>
      <table>
        <thead>
          <tr><th>Día</th><th>Bloques</th><th>Hechos</th><th>Pendientes</th><th>Carga</th><th>Franja</th></tr>
        </thead>
        <tbody>${dayRows}</tbody>
      </table>
    </section>

    <div class="footer">Birra & Brujula · Documento preparado para compartir por PDF</div>
  </body>
  </html>`;

  printReportHtml(html, isCompact ? "Informe compacto" : "Informe detallado");
}

function initConnectivity() {
  let node = document.getElementById("connectionBadge");
  if (!node) {
    node = document.createElement("div");
    node.id = "connectionBadge";
    node.className = "connection-badge";
    document.body.appendChild(node);
  }

  function paint() {
    if (navigator.onLine) {
      node.textContent = "Online | sync local activa";
      node.classList.remove("offline");
    } else {
      node.textContent = "Offline | modo cache";
      node.classList.add("offline");
    }
  }

  window.addEventListener("online", paint);
  window.addEventListener("offline", paint);
  paint();

  window.addEventListener("storage", (event) => {
    if (event.key && Object.values(KEYS).includes(event.key) && event.key !== KEYS.syncStamp) {
      window.location.reload();
    }
  });
}

function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Silencioso: la app sigue funcionando aunque falle el registro.
    });
  }
}

function updateNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav-links a[data-page]").forEach((a) => {
    if (a.dataset.page === page) {
      a.classList.add("active");
    }
  });
}

function fillMemberSelectors() {
  const members = read(KEYS.members, []);
  document.querySelectorAll("[data-member-select]").forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = "";
    const allowCommon = sel.dataset.allowCommon === "true";

    if (allowCommon) {
      const base = document.createElement("option");
      base.value = "Fondo comun";
      base.textContent = "Fondo comun";
      sel.appendChild(base);
    }

    if (!members.length) {
      if (!allowCommon) {
        const op = document.createElement("option");
        op.value = "";
        op.textContent = "Primero crea asistentes";
        sel.appendChild(op);
      }
      return;
    }

    members.forEach((name) => {
      const op = document.createElement("option");
      op.value = name;
      op.textContent = name;
      sel.appendChild(op);
    });

    if (current && (members.includes(current) || current === "Fondo comun")) {
      sel.value = current;
    } else {
      sel.value = allowCommon ? "Fondo comun" : members[0];
    }
  });
}

function initIndex() {
  const memberInput = document.getElementById("memberName");
  const addMemberBtn = document.getElementById("addMemberBtn");
  const membersUl = document.getElementById("membersList");
  const challengeText = document.getElementById("challengeText");

  const challenges = [
    "Reto fogata: cada persona cuenta una historia de viaje de 60 segundos.",
    "Reto cocina: cena de 3 ingredientes por equipos.",
    "Reto campo: gymkana express en 20 minutos.",
    "Reto foto: mejor foto del finde con votacion al volver.",
    "Reto juegos: torneo de cartas al mejor de 3 rondas."
  ];

  function render() {
    const data = summary();
    const settlement = calculateSettlements();
    const activityOverview = getActivityOverview(data.activities, data.itinerary);
    membersUl.innerHTML = "";

    data.members.forEach((name, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(name)}</span><button class="btn-danger" data-rm="${idx}">Quitar</button>`;
      membersUl.appendChild(li);
    });

    document.getElementById("kMembers").textContent = data.members.length;
    document.getElementById("kTotal").textContent = money(data.total);
    document.getElementById("kPer").textContent = money(data.perPerson);
    document.getElementById("kVotes").textContent = data.houses.length;

    const winnerTitle = document.getElementById("winnerTitle");
    const winnerMeta = document.getElementById("winnerMeta");
    const winnerImg = document.getElementById("winnerImg");

    if (data.houseWinner) {
      winnerTitle.textContent = data.houseWinner.name;
      const winnerDateRange = data.houseWinner.dateFrom && data.houseWinner.dateTo
        ? `${data.houseWinner.dateFrom} a ${data.houseWinner.dateTo}`
        : (data.houseWinner.date || "Sin fecha");
      const winnerDate = `Fecha: ${winnerDateRange}`;
      winnerMeta.textContent = `${money(data.houseWinner.price)} | ${data.houseWinner.votes.length} votos | ${winnerDate}`;
      winnerImg.style.backgroundImage = `url('${data.houseWinner.img || FALLBACKS.house}')`;
    } else {
      winnerTitle.textContent = "Sin casa votada aun";
      winnerMeta.textContent = "Entra en Votaciones para proponer opciones";
      winnerImg.style.backgroundImage = `url('${FALLBACKS.house}')`;
    }

    const balanceList = document.getElementById("balanceList");
    const settlementList = document.getElementById("settlementList");
    const summaryStats = document.getElementById("activitySummaryStats");
    const activitySummaryList = document.getElementById("activitySummary");
    if (balanceList && settlementList) {
      balanceList.innerHTML = "";
      settlementList.innerHTML = "";

      if (!settlement.balances.length) {
        balanceList.innerHTML = '<li class="muted">Anade asistentes para calcular balances.</li>';
      } else {
        settlement.balances.forEach((entry) => {
          const li = document.createElement("li");
          const status = entry.amount >= 0 ? "a favor" : "a pagar";
          li.innerHTML = `<span>${escapeHtml(entry.name)}</span><strong>${money(Math.abs(entry.amount))} ${status}</strong>`;
          balanceList.appendChild(li);
        });
      }

      if (!settlement.transfers.length) {
        settlementList.innerHTML = '<li class="muted">No hacen falta transferencias. Todo equilibrado.</li>';
      } else {
        settlement.transfers.forEach((move) => {
          const li = document.createElement("li");
          li.innerHTML = `<span>${escapeHtml(move.from)} paga a ${escapeHtml(move.to)}</span><strong>${money(move.amount)}</strong>`;
          settlementList.appendChild(li);
        });
      }
    }

    if (summaryStats && activitySummaryList) {
      summaryStats.innerHTML = "";
      activitySummaryList.innerHTML = "";

      const statPills = [
        `Propuestas: ${activityOverview.totalActivities}`,
        `Con votos: ${activityOverview.votedActivities}`,
        `Dias planificados: ${activityOverview.totalDays}`,
        `Bloques itinerario: ${activityOverview.totalBlocks}`
      ];
      statPills.forEach((text) => {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = text;
        summaryStats.appendChild(span);
      });

      if (!activityOverview.days.length) {
        activitySummaryList.innerHTML = '<li class="muted">Aun no hay bloques en el itinerario. Puedes generarlo automaticamente desde Actividades.</li>';
      } else {
        activityOverview.days.forEach((day) => {
          const li = document.createElement("li");
          li.innerHTML = `
            <div>
              <strong>${escapeHtml(day.date)}</strong>
              <div class="muted">${day.blocks} bloques | ${day.done} hechos | ${day.pending} pendientes | franja ${day.firstSlot}-${day.lastSlot}</div>
            </div>
            <span class="pill">${escapeHtml(day.load)}</span>`;
          activitySummaryList.appendChild(li);
        });
      }

      if (activityOverview.topActivities.length) {
        const topLi = document.createElement("li");
        topLi.innerHTML = `<span><strong>Top actividades por votos</strong></span><span class="muted">${activityOverview.topActivities.map((item) => `${item.name} (${item.votes})`).join(" | ")}</span>`;
        activitySummaryList.appendChild(topLi);
      }
    }
  }

  addMemberBtn.addEventListener("click", () => {
    const value = memberInput.value.trim();
    if (!value) {
      return;
    }
    const members = read(KEYS.members, []);
    if (members.some((m) => m.toLowerCase() === value.toLowerCase())) {
      alert("Ese nombre ya existe.");
      return;
    }
    members.push(value);
    write(KEYS.members, members);
    memberInput.value = "";
    render();
  });

  memberInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addMemberBtn.click();
    }
  });

  membersUl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-rm]");
    if (!btn) {
      return;
    }
    const idx = Number(btn.dataset.rm);
    const members = read(KEYS.members, []);
    members.splice(idx, 1);
    write(KEYS.members, members);
    render();
  });

  document.getElementById("challengeBtn").addEventListener("click", () => {
    const text = challenges[Math.floor(Math.random() * challenges.length)];
    challengeText.textContent = text;
  });

  const exportPdfCompactBtn = document.getElementById("exportPdfCompactBtn");
  const exportPdfDetailedBtn = document.getElementById("exportPdfDetailedBtn");
  if (exportPdfCompactBtn) {
    exportPdfCompactBtn.addEventListener("click", () => exportPlanToPdf("compact"));
  }
  if (exportPdfDetailedBtn) {
    exportPdfDetailedBtn.addEventListener("click", () => exportPlanToPdf("detailed"));
  }

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Esto borra todo el plan del navegador. Continuar?")) {
      return;
    }
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
    render();
  });

  render();
}

function initHouses() {
  const cards = document.getElementById("houseCards");
  const form = document.getElementById("houseForm");
  const userSelect = document.getElementById("houseUser");

  function render() {
    const houses = [...read(KEYS.houses, [])].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
    cards.innerHTML = "";

    if (!houses.length) {
      cards.innerHTML = '<p class="muted">No hay casas propuestas todavia.</p>';
      return;
    }

    houses.forEach((house) => {
      const current = userSelect.value;
      const votes = Array.isArray(house.votes) ? house.votes : [];
      const active = current && votes.includes(current);
      const voters = votes.length ? votes.join(", ") : "Nadie ha votado aun";
      const houseDateText = house.dateFrom && house.dateTo
        ? `${house.dateFrom} a ${house.dateTo}`
        : (house.date || "");
      const dateBadge = houseDateText ? `<span class="badge">${escapeHtml(houseDateText)}</span>` : "";
      const payerBadge = house.payer ? `<span class="badge">Paga: ${escapeHtml(house.payer)}</span>` : "";
      const briefDesc = house.briefDesc ? `<p class="muted">${escapeHtml(house.briefDesc)}</p>` : "";
      const node = document.createElement("article");
      node.className = "vote-card";
      node.innerHTML = `
        <div class="vote-image" style="background-image:url('${house.img || FALLBACKS.house}')"></div>
        <div class="vote-content">
          <h4>${escapeHtml(house.name)}</h4>
          <div class="row">
            <span class="badge">${money(house.price)}</span>
            <span class="badge">${votes.length} votos</span>
            ${dateBadge}
            ${payerBadge}
          </div>
          ${briefDesc}
          <div class="voters">${escapeHtml(voters)}</div>
          <div class="vote-actions">
            <button class="btn-primary ${active ? "active" : ""}" data-vote="${house.id}">${active ? "Quitar voto" : "Votar"}</button>
            <a href="${house.url || "#"}" target="_blank" rel="noopener noreferrer">Ver sitio</a>
            <button class="btn-danger" data-del="${house.id}">Borrar</button>
          </div>
        </div>`;
      cards.appendChild(node);
    });
  }

  cards.addEventListener("click", (e) => {
    const voteBtn = e.target.closest("button[data-vote]");
    const delBtn = e.target.closest("button[data-del]");
    const houses = read(KEYS.houses, []);

    if (voteBtn) {
      const user = userSelect.value;
      if (!user) {
        alert("Primero crea asistentes y elige usuario.");
        return;
      }
      const id = Number(voteBtn.dataset.vote);
      const house = houses.find((h) => h.id === id);
      if (!house) {
        return;
      }
      if (!Array.isArray(house.votes)) {
        house.votes = [];
      }
      const idx = house.votes.indexOf(user);
      if (idx === -1) {
        house.votes.push(user);
      } else {
        house.votes.splice(idx, 1);
      }
      write(KEYS.houses, houses);
      render();
      return;
    }

    if (delBtn) {
      const id = Number(delBtn.dataset.del);
      write(KEYS.houses, houses.filter((h) => h.id !== id));
      render();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("hName").value.trim();
    const price = Number(document.getElementById("hPrice").value || 0);
    const url = document.getElementById("hUrl").value.trim();
    const payer = document.getElementById("hPayer").value || "Fondo comun";
    const dateFrom = document.getElementById("hDateFrom").value;
    const dateTo = document.getElementById("hDateTo").value;
    const briefDesc = document.getElementById("hDesc").value.trim();
    const file = document.getElementById("hImg").files[0];

    if (!name || price <= 0) {
      alert("Nombre y precio valido son obligatorios.");
      return;
    }

    if (dateFrom && dateTo && dateTo < dateFrom) {
      alert("La fecha hasta no puede ser anterior a la fecha desde.");
      return;
    }

    const img = (await fileToDataUrl(file)) || FALLBACKS.house;
    const houses = read(KEYS.houses, []);
    houses.push({ id: uid(), name, price, url, payer, dateFrom, dateTo, briefDesc, img, votes: [] });
    write(KEYS.houses, houses);
    form.reset();
    render();
  });

  userSelect.addEventListener("change", render);
  fillMemberSelectors();
  render();
}

function initTransport() {
  const typeSel = document.getElementById("tType");
  const payerSel = document.getElementById("tPayer");
  const totalNode = document.getElementById("tTotal");
  const perNode = document.getElementById("tPer");
  const attendeesNode = document.getElementById("tAttendees");

  const members = read(KEYS.members, []);
  const attendees = Math.max(members.length, 1);
  attendeesNode.textContent = String(attendees);

  function activeForm() {
    const type = typeSel.value;
    document.querySelectorAll("[data-t-form]").forEach((el) => {
      el.hidden = el.dataset.tForm !== type;
    });
  }

  function calc() {
    const type = typeSel.value;
    let total = 0;

    if (type === "coche") {
      const km = Number(document.getElementById("cKm").value || 0);
      const l100 = Number(document.getElementById("cCons").value || 0);
      const gas = Number(document.getElementById("cGas").value || 0);
      const toll = Number(document.getElementById("cToll").value || 0);
      total = ((km * 2) / 100) * l100 * gas + toll * 2;
    }

    if (type === "tren") {
      const ticket = Number(document.getElementById("bTicket").value || 0);
      const extras = Number(document.getElementById("bExtra").value || 0);
      total = ticket * attendees + extras;
    }

    if (type === "avion") {
      const ticket = Number(document.getElementById("aTicket").value || 0);
      const bag = Number(document.getElementById("aBag").value || 0);
      const transfer = Number(document.getElementById("aTransfer").value || 0);
      total = (ticket + bag) * attendees + transfer;
    }

    totalNode.textContent = money(total);
    perNode.textContent = money(total / attendees);
    return total;
  }

  document.getElementById("saveTransport").addEventListener("click", () => {
    const total = calc();
    write(KEYS.transport, {
      type: typeSel.value,
      payer: payerSel ? payerSel.value : "Fondo comun",
      total
    });
    alert("Transporte guardado.");
  });

  typeSel.addEventListener("change", () => {
    activeForm();
    calc();
  });

  document.querySelectorAll("#transportForm input").forEach((el) => {
    el.addEventListener("input", calc);
  });

  const saved = read(KEYS.transport, { type: "coche", total: 0 });
  if (saved.type) {
    typeSel.value = saved.type;
  }
  if (payerSel && saved.payer) {
    payerSel.value = saved.payer;
  }
  fillMemberSelectors();
  activeForm();
  calc();
}

function initShopping() {
  const form = document.getElementById("shopForm");
  const tbody = document.getElementById("shopBody");
  const payerSel = document.getElementById("sPayer");

  function updatePayers() {
    const members = read(KEYS.members, []);
    payerSel.innerHTML = "<option>Fondo comun</option>";
    members.forEach((m) => {
      const op = document.createElement("option");
      op.value = m;
      op.textContent = m;
      payerSel.appendChild(op);
    });
  }

  function render() {
    const items = read(KEYS.shopping, []);
    const members = read(KEYS.members, []);
    tbody.innerHTML = "";

    let total = 0;
    items.forEach((item) => {
      total += Number(item.price || 0);
      const tr = document.createElement("tr");
      tr.className = item.checked ? "checked" : "";
      tr.innerHTML = `
        <td><input type="checkbox" data-check="${item.id}" ${item.checked ? "checked" : ""}></td>
        <td class="name">${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${money(item.price)}</td>
        <td>${escapeHtml(item.payer)}</td>
        <td><button class="btn-danger" data-del="${item.id}">Borrar</button></td>`;
      tbody.appendChild(tr);
    });

    const per = total / Math.max(members.length, 1);
    document.getElementById("sTotal").textContent = money(total);
    document.getElementById("sPer").textContent = money(per);
    document.getElementById("sCount").textContent = String(items.length);
  }

  tbody.addEventListener("click", (e) => {
    const del = e.target.closest("button[data-del]");
    if (!del) {
      return;
    }
    const id = Number(del.dataset.del);
    const items = read(KEYS.shopping, []);
    write(KEYS.shopping, items.filter((i) => i.id !== id));
    render();
  });

  tbody.addEventListener("change", (e) => {
    const check = e.target.closest("input[data-check]");
    if (!check) {
      return;
    }
    const id = Number(check.dataset.check);
    const items = read(KEYS.shopping, []);
    const item = items.find((i) => i.id === id);
    if (!item) {
      return;
    }
    item.checked = check.checked;
    write(KEYS.shopping, items);
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("sName").value.trim();
    const category = document.getElementById("sCat").value;
    const price = Number(document.getElementById("sPrice").value || 0);
    const payer = payerSel.value || "Fondo comun";

    if (!name || price <= 0) {
      alert("Producto y precio valido son obligatorios.");
      return;
    }

    const items = read(KEYS.shopping, []);
    items.push({ id: uid(), name, category, price, payer, checked: false });
    write(KEYS.shopping, items);
    form.reset();
    updatePayers();
    render();
  });

  updatePayers();
  render();
}

function initActivities() {
  const cards = document.getElementById("actCards");
  const form = document.getElementById("actForm");
  const userSelect = document.getElementById("actUser");
  const itineraryForm = document.getElementById("itForm");
  const itineraryList = document.getElementById("itList");
  const itineraryFilter = document.getElementById("itDayFilter");
  const autoPlanBtn = document.getElementById("autoPlanBtn");
  const autoDateStart = document.getElementById("autoDateStart");
  const clearDoneBtn = document.getElementById("clearDoneBtn");

  function renderItinerary() {
    if (!itineraryList || !itineraryFilter) {
      return;
    }

    const items = read(KEYS.itinerary, []).sort((a, b) => {
      const keyA = `${a.date || "9999-99-99"} ${a.time || "99:99"}`;
      const keyB = `${b.date || "9999-99-99"} ${b.time || "99:99"}`;
      return keyA.localeCompare(keyB);
    });

    const uniqDates = [...new Set(items.map((item) => item.date).filter(Boolean))];
    const selected = itineraryFilter.value;
    itineraryFilter.innerHTML = '<option value="">Todos los dias</option>';

    uniqDates.forEach((date) => {
      const op = document.createElement("option");
      op.value = date;
      op.textContent = date;
      itineraryFilter.appendChild(op);
    });

    if (selected && uniqDates.includes(selected)) {
      itineraryFilter.value = selected;
    }

    const dayFilter = itineraryFilter.value;
    const filtered = dayFilter ? items.filter((item) => item.date === dayFilter) : items;
    itineraryList.innerHTML = "";

    if (!filtered.length) {
      itineraryList.innerHTML = '<li class="muted">No hay bloques de itinerario para este dia.</li>';
      return;
    }

    filtered.forEach((item) => {
      const li = document.createElement("li");
      li.className = "itinerary-item";
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(item.date || "Sin fecha")} · ${escapeHtml(item.time || "--:--")}</strong>
          <div>${escapeHtml(item.title)}</div>
          <div class="muted">${escapeHtml(item.area || "General")} ${item.note ? `| ${escapeHtml(item.note)}` : ""}</div>
        </div>
        <div class="row">
          <label><input type="checkbox" data-it-check="${item.id}" ${item.done ? "checked" : ""}> Hecho</label>
          <button class="btn-danger" data-it-del="${item.id}">Borrar</button>
        </div>`;
      itineraryList.appendChild(li);
    });
  }

  function render() {
    const plans = [...read(KEYS.activities, [])].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
    const current = userSelect.value;
    cards.innerHTML = "";

    if (!plans.length) {
      cards.innerHTML = '<p class="muted">Sin actividades propuestas aun.</p>';
      document.getElementById("myActTotal").textContent = money(0);
      return;
    }

    let myTotal = 0;

    plans.forEach((plan) => {
      const votes = Array.isArray(plan.votes) ? plan.votes : [];

      if (current && votes.includes(current)) {
        myTotal += Number(plan.price || 0);
      }

      const active = current && votes.includes(current);
      const node = document.createElement("article");
      node.className = "vote-card";
      node.innerHTML = `
      <div class="vote-image" style="background-image:url('${plan.img || FALLBACKS.activity}')"></div>
      <div class="vote-content">
        <h4>${escapeHtml(plan.name)}</h4>
        <div class="row">
          <span class="badge">${escapeHtml(plan.category)}</span>
          <span class="badge">${money(plan.price)} pp</span>
        </div>
        <p class="muted">${escapeHtml(plan.desc || "Sin descripcion")}</p>
        <div class="voters">${votes.length ? escapeHtml(votes.join(", ")) : "Nadie ha votado aun"}</div>
        <div class="vote-actions">
          <button class="btn-primary ${active ? "active" : ""}" data-vote="${plan.id}">${active ? "Quitar voto" : "Me apunto"}</button>
          <a href="${plan.url || "#"}" target="_blank" rel="noopener noreferrer">Ver enlace</a>
          <button class="btn-danger" data-del="${plan.id}">Borrar</button>
        </div>
      </div>`;
      cards.appendChild(node);
    });

    document.getElementById("myActTotal").textContent = money(myTotal);
  }

  cards.addEventListener("click", (e) => {
    const vote = e.target.closest("button[data-vote]");
    const del = e.target.closest("button[data-del]");
    const plans = read(KEYS.activities, []);

    if (vote) {
      const user = userSelect.value;
      if (!user) {
        alert("Selecciona un usuario para votar.");
        return;
      }
      const id = Number(vote.dataset.vote);
      const plan = plans.find((p) => p.id === id);
      if (!plan) {
        return;
      }
      if (!Array.isArray(plan.votes)) {
        plan.votes = [];
      }
      const idx = plan.votes.indexOf(user);
      if (idx === -1) {
        plan.votes.push(user);
      } else {
        plan.votes.splice(idx, 1);
      }
      write(KEYS.activities, plans);
      render();
      return;
    }

    if (del) {
      const id = Number(del.dataset.del);
      write(KEYS.activities, plans.filter((p) => p.id !== id));
      render();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("aName").value.trim();
    const category = document.getElementById("aCat").value;
    const price = Number(document.getElementById("aPrice").value || 0);
    const desc = document.getElementById("aDesc").value.trim();
    const url = document.getElementById("aUrl").value.trim();
    const file = document.getElementById("aImg").files[0];

    if (!name || price <= 0) {
      alert("Nombre y precio por persona son obligatorios.");
      return;
    }

    const img = (await fileToDataUrl(file)) || FALLBACKS.activity;
    const plans = read(KEYS.activities, []);
    plans.push({ id: uid(), name, category, price, desc, url, img, votes: [] });
    write(KEYS.activities, plans);
    form.reset();
    render();
  });

  userSelect.addEventListener("change", render);

  if (itineraryForm && itineraryList) {
    itineraryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const date = document.getElementById("itDate").value;
      const time = document.getElementById("itTime").value;
      const title = document.getElementById("itTitle").value.trim();
      const area = document.getElementById("itArea").value;
      const note = document.getElementById("itNote").value.trim();

      if (!date || !time || !title) {
        alert("Fecha, hora y titulo son obligatorios en itinerario.");
        return;
      }

      const items = read(KEYS.itinerary, []);
      items.push({ id: uid(), date, time, title, area, note, done: false });
      write(KEYS.itinerary, items);
      itineraryForm.reset();
      renderItinerary();
    });

    itineraryList.addEventListener("click", (e) => {
      const del = e.target.closest("button[data-it-del]");
      if (!del) {
        return;
      }
      const id = Number(del.dataset.itDel);
      const items = read(KEYS.itinerary, []);
      write(KEYS.itinerary, items.filter((item) => item.id !== id));
      renderItinerary();
    });

    itineraryList.addEventListener("change", (e) => {
      const check = e.target.closest("input[data-it-check]");
      if (!check) {
        return;
      }
      const id = Number(check.dataset.itCheck);
      const items = read(KEYS.itinerary, []);
      const item = items.find((entry) => entry.id === id);
      if (!item) {
        return;
      }
      item.done = check.checked;
      write(KEYS.itinerary, items);
      renderItinerary();
    });

    itineraryFilter.addEventListener("change", renderItinerary);

    if (autoDateStart) {
      autoDateStart.value = new Date().toISOString().slice(0, 10);
    }

    if (autoPlanBtn) {
      autoPlanBtn.addEventListener("click", () => {
        const plans = [...read(KEYS.activities, [])]
          .sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))
          .filter((p) => Number(p.price || 0) >= 0);

        if (!plans.length) {
          alert("No hay actividades para generar el plan automático.");
          return;
        }

        const startDate = autoDateStart && autoDateStart.value
          ? autoDateStart.value
          : new Date().toISOString().slice(0, 10);

        const slots = [
          { time: "10:00", area: "Actividad exterior" },
          { time: "13:30", area: "Comida" },
          { time: "17:30", area: "Juego" },
          { time: "21:30", area: "General" }
        ];

        const items = read(KEYS.itinerary, []);
        let dayOffset = 0;

        plans.forEach((plan, index) => {
          const slot = slots[index % slots.length];
          dayOffset = Math.floor(index / slots.length);

          const date = new Date(startDate);
          date.setDate(date.getDate() + dayOffset);
          const dayText = date.toISOString().slice(0, 10);

          items.push({
            id: uid(),
            date: dayText,
            time: slot.time,
            title: `Plan auto: ${plan.name}`,
            area: slot.area,
            note: `${plan.category || "Actividad"} | votos: ${(plan.votes || []).length}`,
            done: false
          });
        });

        write(KEYS.itinerary, items);
        renderItinerary();
        alert("Plan diario automático generado.");
      });
    }

    if (clearDoneBtn) {
      clearDoneBtn.addEventListener("click", () => {
        const items = read(KEYS.itinerary, []);
        write(KEYS.itinerary, items.filter((item) => !item.done));
        renderItinerary();
      });
    }
  }

  fillMemberSelectors();
  render();
  renderItinerary();
}

document.addEventListener("DOMContentLoaded", () => {
  initServiceWorker();
  initConnectivity();
  updateNav();
  const page = document.body.dataset.page;

  if (page === "home") {
    initIndex();
  }
  if (page === "houses") {
    initHouses();
  }
  if (page === "transport") {
    initTransport();
  }
  if (page === "shopping") {
    initShopping();
  }
  if (page === "activities") {
    initActivities();
  }
});
