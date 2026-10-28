// RodaFin — app offline (PWA). Todos os dados ficam no próprio aparelho (localStorage).
'use strict';

// ================================================================= Utilitários
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const E = (f, n) => f.elements.namedItem(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v, d = 1) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const r2 = v => Math.round(v * 100) / 100;
const N = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const agoraHM = () => new Date().toTimeString().slice(0, 5);
const dBR = iso => iso ? iso.split('-').reverse().join('/') : '';
const DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dSem = iso => DS[new Date(iso + 'T12:00').getDay()];
const fds = iso => [0, 6].includes(new Date(iso + 'T12:00').getDay());
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBR = ym => { const [a, m] = ym.split('-'); return `${MES[+m - 1]}/${a}`; };
const minHM = s => { if (!s) return 0; const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hm = m => { m = Math.max(0, Math.round(m || 0)); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const duracao = (i, f, p) => { let d = minHM(f) - minHM(i); if (d < 0) d += 1440; return Math.max(0, d - minHM(p)); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const addMeses = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const ICO = {
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
};
const bEd = (col, form, id) => `<button class="ic" data-act="editar" data-col="${col}" data-form="${form}" data-id="${id}" aria-label="Editar">${ICO.edit}</button>`;
const bDel = (col, id) => `<button class="ic del" data-act="excluir" data-col="${col}" data-id="${id}" aria-label="Excluir">${ICO.del}</button>`;

function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('erro', erro); t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), erro ? 4000 : 2400);
}
class Erro extends Error {}
const falha = m => { throw new Erro(m); };

// ================================================================= Dados
const CHAVE = 'rodafin.v1';
const PADRAO = () => ({
  versao: 1, seq: 1,
  config: { metaDiaUtil: 150, metaFimSemana: 400, metaLucro: 1200, propE: 2, propG: 1, precoEtanol: 3.69, precoGasolina: 5.84, carroPadrao: 0 },
  carros: [], dias: [], abastecimentos: [], despesas: [], manutencoes: [], rendas: [], custos: [], ultimoBackup: ''
});
let DB;
function carregarDB() {
  try { DB = JSON.parse(localStorage.getItem(CHAVE)) || PADRAO(); } catch { DB = PADRAO(); }
  const p = PADRAO();
  for (const k in p) if (DB[k] === undefined) DB[k] = p[k];
  for (const k in p.config) if (DB.config[k] === undefined) DB.config[k] = p.config[k];
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(DB)); }
  catch { toast('Sem espaço para salvar. Exporte um backup.', true); }
}
const novoId = () => DB.seq++;
const achar = (col, id) => DB[col].find(x => x.id === Number(id));
const carroPadrao = () => achar('carros', DB.config.carroPadrao) || DB.carros[0];
const diaAberto = () => DB.dias.find(d => d.status === 'ABERTO');
const nomeCarro = id => (achar('carros', id) || {}).nome || '—';

// ================================================================= Cálculos
function statsCarro(c) {
  const cfg = DB.config, pe = N(cfg.propE), pg = N(cfg.propG);
  const ab = DB.abastecimentos.filter(a => a.carroId === c.id);
  let hod = N(c.hodometroInicial);
  const leituras = [];
  for (const d of DB.dias.filter(d => d.carroId === c.id)) {
    hod = Math.max(hod, d.hodometroInicial, d.hodometroFinal || 0);
    leituras.push([d.data, d.hodometroInicial]); if (d.hodometroFinal) leituras.push([d.data, d.hodometroFinal]);
  }
  for (const a of ab) { hod = Math.max(hod, a.hodometro); leituras.push([a.data, a.hodometro]); }

  // ritmo km/dia nos últimos 30 dias
  let kmDia = 0;
  const lim = addDias(hoje(), -30), rec = leituras.filter(l => l[0] >= lim).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
  if (rec.length >= 2) {
    const dias = diasEntre(rec[0][0], rec[rec.length - 1][0]), km = rec[rec.length - 1][1] - rec[0][1];
    if (dias >= 3 && km > 0) kmDia = km / dias;
  }

  // custo/km medido: tanque cheio a tanque cheio
  const ord = ab.filter(a => a.hodometro > 0 && a.litros > 0).sort((a, b) => a.hodometro - b.hodometro || (a.data < b.data ? -1 : 1));
  const cheios = ord.map((a, i) => a.tanqueCheio ? i : -1).filter(i => i >= 0);
  let custoKm = 0, consumo = 0, metodo = 'ESTIMADO', fonte = '';
  if (cheios.length >= 2) {
    const fim = cheios[cheios.length - 1], ini = cheios[Math.max(0, cheios.length - 7)];
    const km = ord[fim].hodometro - ord[ini].hodometro;
    let l = 0, v = 0; for (let i = ini + 1; i <= fim; i++) { l += ord[i].litros; v += ord[i].valor; }
    if (km >= 30 && l > 0) {
      custoKm = v / km; consumo = km / l; metodo = 'MEDIDO';
      const ciclos = cheios.indexOf(fim) - cheios.indexOf(ini);
      fonte = `Medido: ${ciclos} ${ciclos === 1 ? 'ciclo' : 'ciclos'} de tanque cheio (${num(km, 0)} km)`;
    }
  }
  if (metodo === 'ESTIMADO' && ord.length >= 2) {
    const km = ord[ord.length - 1].hodometro - ord[0].hodometro;
    let l = 0, v = 0; for (let i = 0; i < ord.length - 1; i++) { l += ord[i].litros; v += ord[i].valor; }
    if (km >= 50 && l > 0) { custoKm = v / km; consumo = km / l; metodo = 'APROX'; fonte = 'Aproximado (marque "tanque cheio" para precisão)'; }
  }
  const media = t => { const x = ab.filter(a => a.combustivel === t); const l = x.reduce((s, a) => s + a.litros, 0); return l ? x.reduce((s, a) => s + a.valor, 0) / l : 0; };
  const pE = media('ETANOL') || N(cfg.precoEtanol), pG = media('GASOLINA') || N(cfg.precoGasolina);
  if (metodo === 'ESTIMADO') {
    const cE = N(c.consumoEtanol) || 8.7, cG = N(c.consumoGasolina) || 12;
    custoKm = (pe * pE + pg * pG) / Math.max(0.01, pe * cE + pg * cG);
    consumo = (pe * cE + pg * cG) / Math.max(1, pe + pg);
    fonte = 'Estimado pelo consumo do carro. Registre abastecimentos com tanque cheio para medir o real.';
  }

  let manutKm = 0, manutMes = 0;
  for (const m of DB.manutencoes.filter(m => m.carroId === c.id)) {
    if (m.intervaloKm > 0) manutKm += m.custoEstimado / m.intervaloKm;
    else if (m.intervaloMeses > 0) manutMes += m.custoEstimado / m.intervaloMeses;
  }

  // próximo combustível do ciclo (ex.: E, E, G)
  const cron = [...ab].sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : a.hodometro - b.hodometro);
  let prox = pe > 0 ? 'ETANOL' : 'GASOLINA';
  if (cron.length && pe > 0 && pg > 0) {
    const ult = cron[cron.length - 1].combustivel; let seg = 0;
    for (let i = cron.length - 1; i >= 0 && cron[i].combustivel === ult; i--) seg++;
    prox = ult === 'ETANOL' ? (seg >= pe ? 'GASOLINA' : 'ETANOL') : (seg >= pg ? 'ETANOL' : 'GASOLINA');
  }
  return { hod, kmDia, custoKm, consumo, metodo, fonte, pE, pG, manutKm, manutMes, prox, ultimos: cron.slice(-(pe + pg || 3)).map(a => a.combustivel[0]) };
}

function previsao(c, st) {
  return DB.manutencoes.filter(m => m.carroId === c.id).map(m => {
    const proxKm = m.intervaloKm > 0 ? m.ultimoKm + m.intervaloKm : null;
    const restKm = proxKm != null ? proxKm - st.hod : null;
    const dataTempo = m.intervaloMeses > 0 ? addMeses(m.ultimaData, m.intervaloMeses) : null;
    const dataKm = restKm != null && st.kmDia > 0 ? addDias(hoje(), Math.ceil(Math.max(0, restKm) / st.kmDia)) : null;
    const prev = [dataKm, dataTempo].filter(Boolean).sort()[0] || null;
    const dias = prev ? diasEntre(hoje(), prev) : null;
    const venc = (restKm != null && restKm <= 0) || (dataTempo && dataTempo <= hoje());
    const prox = !venc && ((restKm != null && restKm <= Math.max(1000, m.intervaloKm * .1)) || (dias != null && dias <= 30));
    const pk = m.intervaloKm > 0 ? (st.hod - m.ultimoKm) / m.intervaloKm : 0;
    const pt = m.intervaloMeses > 0 ? diasEntre(m.ultimaData, hoje()) / (m.intervaloMeses * 30.44) : 0;
    return { ...m, carroNome: c.nome, restKm, prev, dias, status: venc ? 'VENCIDA' : prox ? 'PROXIMA' : 'OK', prog: Math.max(0, Math.min(100, Math.max(pk, pt) * 100)) };
  }).sort((a, b) => ({ VENCIDA: 0, PROXIMA: 1, OK: 2 }[a.status] - { VENCIDA: 0, PROXIMA: 1, OK: 2 }[b.status]) || ((a.dias ?? 1e9) - (b.dias ?? 1e9)));
}
const prevTxt = m => [m.restKm != null ? (m.restKm <= 0 ? `passou ${num(-m.restKm, 0)} km` : `faltam ${num(m.restKm, 0)} km`) : null,
  m.prev ? (m.dias < 0 ? `venceu ${dBR(m.prev)}` : `~${dBR(m.prev)} (${m.dias} dias)`) : null].filter(Boolean).join(' · ') || 'sem previsão';
const STS = { OK: ['ok', 'Em dia'], PROXIMA: ['warn', 'Próxima'], VENCIDA: ['bad', 'Vencida'] };

function obrigacoes() {
  let uber = 0, renda = 0; const itens = [];
  for (const c of DB.custos) { (c.pagoPor === 'UBER' ? (uber += c.valor) : (renda += c.valor)); itens.push({ d: c.descricao, v: c.valor, p: c.pagoPor }); }
  for (const car of DB.carros) {
    const f = car.financiamento; if (!f) continue;
    const pend = f.parcelas.filter(p => !p.paga).length;
    const rN = Math.min(f.porRenda, pend), uN = Math.min(f.porUber, pend - rN);
    if (rN) { renda += rN * f.valorParcela; itens.push({ d: `Parcelas ${car.nome} (${rN}×)`, v: rN * f.valorParcela, p: 'RENDA' }); }
    if (uN) { uber += uN * f.valorParcela; itens.push({ d: `Parcelas ${car.nome} (${uN}×)`, v: uN * f.valorParcela, p: 'UBER' }); }
  }
  return { uber, renda, rendas: DB.rendas.reduce((s, r) => s + r.valor, 0), itens };
}

function resumo(ym) {
  const cfg = DB.config, stats = {}; DB.carros.forEach(c => stats[c.id] = statsCarro(c));
  let bruto = 0, km = 0, comb = 0, resKm = 0, min = 0, corr = 0; const serie = {};
  for (const d of DB.dias) {
    if (!d.data.startsWith(ym) || d.status !== 'FECHADO' || !stats[d.carroId]) continue;
    const st = stats[d.carroId];
    bruto += d.ganho; km += d.km; comb += d.km * st.custoKm; resKm += d.km * st.manutKm; min += d.minutos; corr += d.corridas || 0;
    const s = serie[d.data] = serie[d.data] || { g: 0, c: 0 }; s.g += d.ganho; s.c += d.km * (st.custoKm + st.manutKm);
  }
  const resMes = DB.carros.reduce((s, c) => s + stats[c.id].manutMes, 0);
  let desp = 0; const cat = {};
  for (const x of DB.despesas) if (x.data.startsWith(ym) && !x.manutencaoId) { desp += x.valor; cat[x.categoria] = (cat[x.categoria] || 0) + x.valor; }
  const ob = obrigacoes(), reserva = resKm + resMes;
  const lucro = bruto - comb - reserva - desp, sobraUber = lucro - ob.uber, alvo = ob.uber + N(cfg.metaLucro);
  const [a, m] = ym.split('-').map(Number), ult = new Date(a, m, 0).getDate();
  let du = 0, fs = 0, plan = 0;
  for (let i = 1; i <= ult; i++) {
    const iso = `${ym}-${String(i).padStart(2, '0')}`, f = fds(iso);
    if (iso <= hoje()) plan += f ? N(cfg.metaFimSemana) : N(cfg.metaDiaUtil); else if (f) fs++; else du++;
  }
  const cp = carroPadrao(), stp = cp ? stats[cp.id] : null;
  const ganhoKm = km > 0 ? bruto / km : 1.8;
  const margem = Math.max(0.05, 1 - (stp ? stp.custoKm + stp.manutKm : 0) / ganhoKm);
  const falta = Math.max(0, (alvo + desp + resMes) / margem - bruto);
  const peso = du * N(cfg.metaDiaUtil) + fs * N(cfg.metaFimSemana);
  return { bruto, km, comb, reserva, desp, cat, lucro, sobraUber, alvo, ob, min, corr, plan,
    sobraRenda: ob.rendas - ob.renda, dias: Object.keys(serie).length, serie, falta, restantes: du + fs,
    faltaDU: peso ? falta * N(cfg.metaDiaUtil) / peso : falta, faltaFS: peso ? falta * N(cfg.metaFimSemana) / peso : falta,
    prog: alvo > 0 ? Math.max(0, lucro) / alvo * 100 : 0, stats };
}

// ================================================================= Navegação
let VIEW = 'painel', ABA = 'carros';
const SUB = { painel: 'Seu mês na direção', dias: 'Hodômetro no início e no fim', comb: 'Custo por km real', manut: 'Plano e previsão', mais: 'Cadastros e ajustes' };
function ir(v) {
  if (['dias', 'comb', 'manut'].includes(v) && !DB.carros.length) { toast('Cadastre um carro primeiro.'); v = 'mais'; ABA = 'carros'; }
  VIEW = v;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  $('#topSub').textContent = SUB[v];
  render();
  window.scrollTo({ top: 0 });
}
$$('#nav a').forEach(a => a.addEventListener('click', () => ir(a.dataset.view)));
$('#mesSel').addEventListener('change', () => render());
const mes = () => $('#mesSel').value;

function render() {
  popularCarros();
  const a = diaAberto();
  $('#running').hidden = !a || VIEW === 'dias';
  if (a) $('#runningInfo').textContent = `${nomeCarro(a.carroId)} · desde ${a.horaInicio} · ${num(a.hodometroInicial, 0)} km`;
  ({ painel, dias, comb, manut, mais })[VIEW]();
}
function popularCarros() {
  const opts = DB.carros.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  $$('select.selCarro').forEach(s => { const v = s.value; s.innerHTML = opts; s.value = achar('carros', v) ? v : (carroPadrao() || {}).id || ''; });
}

// ================================================================= Painel
function painel() {
  const passos = [
    { ok: DB.carros.length > 0, t: 'Cadastre seu carro', a: 'carros' },
    { ok: DB.rendas.length + DB.custos.length > 0, t: 'Rendas e custos fixos (salário, seguro)', a: 'fixos' },
    { ok: DB.carros.some(c => c.financiamento), t: 'Financiamento (opcional)', a: 'financ' }
  ];
  $('#onboarding').hidden = passos.every(p => p.ok) || (DB.carros.length && localStorage.getItem('rf.guia'));
  $('#steps').innerHTML = passos.map((p, i) => `<li class="${p.ok ? 'ok' : ''}"><span class="n">${p.ok ? '✓' : i + 1}</span><span>${p.t}</span>
    ${p.ok ? '' : `<button class="btn ${i ? 'ghost' : 'primary'} sm" data-act="ir" data-view="mais" data-aba="${p.a}">Abrir</button>`}</li>`).join('')
    + (DB.carros.length ? '<li><button class="btn ghost sm" data-act="guia">Ocultar guia</button></li>' : '');
  $('#painelOk').hidden = !DB.carros.length;
  if (!DB.carros.length) return;

  const r = resumo(mes()), cfg = DB.config;
  const h = $('#hSobra'); h.textContent = brl(r.sobraUber); h.classList.toggle('neg', r.sobraUber < 0);
  $('#hBar').style.width = Math.min(100, r.prog) + '%';
  $('#hMeta').textContent = `${num(r.prog, 0)}% do alvo · meta de lucro ${brl(cfg.metaLucro)}`;
  $('#hFalta').innerHTML = r.falta <= 0 ? '🎉 Meta do mês batida!'
    : r.restantes ? `Faltam <b>${brl(r.falta)}</b> de faturamento: <b>${brl(r.faltaDU)}</b>/dia útil e <b>${brl(r.faltaFS)}</b>/dia de fim de semana (${r.restantes} dias)`
      : `Faltaram ${brl(r.falta)} de faturamento neste mês.`;
  $('#kBruto').textContent = brl(r.bruto); $('#kDias').textContent = `${r.dias} dias · plano até hoje ${brl(r.plan)}`;
  $('#kLucro').textContent = brl(r.lucro);
  $('#kKm').textContent = num(r.km, 0) + ' km'; $('#kRkm').textContent = r.km ? `${brl(r.bruto / r.km)}/km ganho` : '—';
  $('#kHoras').textContent = hm(r.min); $('#kRh').textContent = r.min ? `${brl(r.bruto / (r.min / 60))}/h bruto` : '—';

  const li = (c, t, v) => `<li class="${c}"><span>${t}</span><b>${v}</b></li>`;
  $('#flow').innerHTML = [li('sec', 'Uber', ''), li('add', 'Faturamento', brl(r.bruto)), li('sub', '− Combustível', brl(r.comb)),
    li('sub', '− Reserva manutenção', brl(r.reserva)), ...Object.entries(r.cat).map(([k, v]) => li('sub', '− ' + esc(k), brl(v))),
    li('tot', 'Lucro operacional', brl(r.lucro)), ...r.ob.itens.filter(i => i.p === 'UBER').map(i => li('sub', '− ' + esc(i.d), brl(i.v))),
    li('tot ' + (r.sobraUber >= cfg.metaLucro ? 'ok' : 'bad'), 'Sobra do Uber', brl(r.sobraUber)),
    ...(r.ob.rendas || r.ob.renda ? [li('sec', 'Renda fixa', ''), li('add', 'Rendas fixas', brl(r.ob.rendas)),
      ...r.ob.itens.filter(i => i.p === 'RENDA').map(i => li('sub', '− ' + esc(i.d), brl(i.v))), li('tot', 'Sobra da renda', brl(r.sobraRenda))] : []),
    li('grand', 'Sobra total do mês', brl(r.sobraUber + r.sobraRenda))].join('');

  const prev = DB.carros.flatMap(c => previsao(c, r.stats[c.id])).slice(0, 4);
  $('#pManut').innerHTML = prev.map(m => `<li><div class="t"><b>${esc(m.item)}</b><span class="pill ${STS[m.status][0]}">${STS[m.status][1]}</span></div>
    <div class="prog ${m.status}"><span style="width:${m.prog}%"></span></div><small>${prevTxt(m)} · ${brl(m.custoEstimado)}</small></li>`).join('')
    || '<li class="muted small">Nenhum item cadastrado.</li>';
  grafico(r);
}
function grafico(r) {
  const c = $('#chart'), dpr = devicePixelRatio || 1, w = c.clientWidth, h = 180;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, w, h); x.font = '10px sans-serif';
  const s = Object.entries(r.serie).sort();
  $('#chartVazio').hidden = s.length > 0; if (!s.length) return;
  const max = Math.max(...s.map(([, v]) => v.g), DB.config.metaFimSemana) * 1.1, pl = 8, pb = 18, H = h - pb - 6, slot = (w - pl * 2) / s.length, bw = Math.min(18, slot * .35);
  s.forEach(([d, v], i) => {
    const cx = pl + slot * i + slot / 2, meta = fds(d) ? DB.config.metaFimSemana : DB.config.metaDiaUtil;
    x.fillStyle = v.g >= meta ? '#10b981' : '#6ee7b7'; x.fillRect(cx - bw, 6 + H * (1 - v.g / max), bw - 1, H * v.g / max);
    x.fillStyle = '#fca5a5'; x.fillRect(cx, 6 + H * (1 - v.c / max), bw - 1, H * v.c / max);
    if (s.length <= 16 || i % 2 === 0) { x.fillStyle = '#94a3b8'; x.textAlign = 'center'; x.fillText(d.slice(8), cx, h - 4); }
  });
}

// ================================================================= Dias
const fDia = $('#fDia'), fEnc = $('#fEncerrar');
function toggleFim() {
  const on = E(fDia, 'fechado').checked; fDia.querySelector('.fim').hidden = !on;
  ['hodometroFinal', 'horaFim', 'ganho'].forEach(n => E(fDia, n).required = on);
  if (!E(fDia, 'id').value) $('#fDiaBtn').textContent = on ? 'Salvar dia' : 'Iniciar dia';
}
E(fDia, 'fechado').addEventListener('change', toggleFim);
E(fDia, 'data').addEventListener('change', dica);
E(fDia, 'carroId').addEventListener('change', () => { if (!E(fDia, 'id').value) E(fDia, 'hodometroInicial').value = Math.round(statsCarro(achar('carros', E(fDia, 'carroId').value)).hod); });
function dica() { const d = E(fDia, 'data').value; if (d) $('#metaHint').textContent = `${dSem(d)} · meta ${brl(fds(d) ? DB.config.metaFimSemana : DB.config.metaDiaUtil)}`; }

function dias() {
  const a = diaAberto(), ed = !!E(fDia, 'id').value;
  fEnc.hidden = !a; fDia.hidden = !!a && !ed;
  if (a) {
    $('#encInfo').textContent = `${nomeCarro(a.carroId)} · ${dSem(a.data)} ${dBR(a.data)} · início ${a.horaInicio} · ${num(a.hodometroInicial, 0)} km`;
    if (!E(fEnc, 'horaFim').value) E(fEnc, 'horaFim').value = agoraHM();
    prevEnc();
  }
  if (!ed) {
    if (!E(fDia, 'data').value) E(fDia, 'data').value = hoje();
    if (!E(fDia, 'horaInicio').value) E(fDia, 'horaInicio').value = agoraHM();
    const c = achar('carros', E(fDia, 'carroId').value);
    if (c && !E(fDia, 'hodometroInicial').value) E(fDia, 'hodometroInicial').value = Math.round(statsCarro(c).hod);
  }
  dica();
  const l = DB.dias.filter(d => d.data.startsWith(mes())).sort((a, b) => b.data.localeCompare(a.data) || b.horaInicio.localeCompare(a.horaInicio));
  const fe = l.filter(d => d.status === 'FECHADO');
  $('#totDias').textContent = `${fe.length} dias · ${brl(fe.reduce((s, d) => s + d.ganho, 0))}`;
  $('#listDias').innerHTML = l.map(d => {
    const ok = d.status === 'FECHADO', meta = fds(d.data) ? DB.config.metaFimSemana : DB.config.metaDiaUtil;
    return `<div class="it"><div class="main"><b>${dSem(d.data)} ${dBR(d.data)}</b>
      <small>${d.horaInicio}${ok ? '–' + d.horaFim + ' · ' + hm(d.minutos) : ''} · ${ok ? num(d.km, 0) + ' km' : num(d.hodometroInicial, 0) + ' → …'}${ok && d.km ? ' · ' + brl(d.ganho / d.km) + '/km' : ''}</small></div>
      <div class="val">${ok ? brl(d.ganho) + `<small><span class="pill ${d.ganho >= meta ? 'ok' : 'bad'}">meta ${brl(meta)}</span></small>` : '<span class="pill run">Em andamento</span>'}</div>
      ${bEd('dias', 'fDia', d.id)}${bDel('dias', d.id)}</div>`;
  }).join('') || '<p class="empty">Nenhum dia neste mês.</p>';
}
function validarDia(b, id) {
  const car = achar('carros', b.carroId) || falha('Selecione um carro.');
  if (!b.horaInicio) falha('Informe a hora de início.');
  const hi = N(b.hodometroInicial), hf = N(b.hodometroFinal); if (hi <= 0) falha('Informe o hodômetro inicial.');
  const fechado = hf > 0 && b.horaFim;
  if ((hf > 0 || b.horaFim) && !fechado) falha('Para encerrar, informe hodômetro final e hora de término.');
  if (fechado && hf < hi) falha('O hodômetro final não pode ser menor que o inicial.');
  if (fechado && hf - hi > 2500) falha('Mais de 2.500 km num dia? Confira o hodômetro.');
  if (!fechado && DB.dias.some(d => d.status === 'ABERTO' && d.id !== id)) falha('Já existe um dia em andamento. Encerre-o antes.');
  const pausa = /^\d{1,2}:\d{2}$/.test(b.pausa || '') ? b.pausa.padStart(5, '0') : '00:00';
  return { carroId: car.id, data: b.data || hoje(), horaInicio: b.horaInicio, horaFim: fechado ? b.horaFim : '', pausa,
    hodometroInicial: hi, hodometroFinal: fechado ? hf : 0, ganho: fechado ? N(b.ganho) : 0, corridas: N(b.corridas),
    status: fechado ? 'FECHADO' : 'ABERTO', km: fechado ? r2(hf - hi) : 0, minutos: fechado ? duracao(b.horaInicio, b.horaFim, pausa) : 0 };
}
function prevEnc() {
  const a = diaAberto(); if (!a) return;
  const hf = N(E(fEnc, 'hodometroFinal').value), g = N(E(fEnc, 'ganho').value);
  if (!hf || hf < a.hodometroInicial) { $('#encPrev').textContent = ''; return; }
  const st = statsCarro(achar('carros', a.carroId)), km = hf - a.hodometroInicial, mins = duracao(a.horaInicio, E(fEnc, 'horaFim').value, E(fEnc, 'pausa').value);
  const custo = km * (st.custoKm + st.manutKm);
  $('#encPrev').innerHTML = `${num(km, 0)} km · ${hm(mins)}<br>Custo do carro ≈ <b>${brl(custo)}</b> · lucro ≈ <b>${brl(g - custo)}</b>`;
}
fEnc.addEventListener('input', prevEnc);
fEnc.addEventListener('submit', e => {
  e.preventDefault();
  const a = diaAberto();
  try {
    Object.assign(a, validarDia({ ...a, ...ler(fEnc) }, a.id)); salvar();
    fEnc.reset(); E(fEnc, 'pausa').value = '00:00'; toast('Dia encerrado ✔ Bom descanso!'); render();
  } catch (er) { if (er instanceof Erro) toast(er.message, true); else throw er; }
});

// ================================================================= Combustível
const fAb = $('#fAbast');
function comb() {
  const c = achar('carros', E(fAb, 'carroId').value) || carroPadrao(), st = statsCarro(c), px = st.prox[0];
  $('#mix').innerHTML = `<div class="tanks">${st.ultimos.map(t => `<div class="tank ${t}">${t}</div>`).join('')}<div class="tank ${px} nx">${px}</div>
      <div style="margin-left:8px"><small class="muted">Próximo (${DB.config.propE}:${DB.config.propG})</small><br><b>${px === 'E' ? '🌱 Etanol' : '⛽ Gasolina'}</b></div></div>
    <div class="st"><span>Custo por km</span><b>${brl(st.custoKm)}</b></div><div class="st"><span>Consumo ${st.metodo === 'ESTIMADO' ? '(ref.)' : 'medido'}</span><b>${num(st.consumo, 2)} km/L</b></div>
    <div class="st"><span>Preço médio E · G</span><b>${brl(st.pE)} · ${brl(st.pG)}</b></div><div class="st"><span>Hodômetro</span><b>${num(st.hod, 0)} km</b></div>
    <div class="fonte">${st.metodo === 'MEDIDO' ? '✅' : 'ℹ️'} ${esc(st.fonte)}</div>`;
  if (!E(fAb, 'id').value) {
    if (!E(fAb, 'data').value) E(fAb, 'data').value = hoje();
    if (!E(fAb, 'hodometro').value) E(fAb, 'hodometro').value = Math.round(st.hod);
    $(st.prox === 'ETANOL' ? '#cE' : '#cG').checked = true;
    if (!E(fAb, 'precoLitro').value) E(fAb, 'precoLitro').value = (st.prox === 'ETANOL' ? st.pE : st.pG).toFixed(2);
  }
  const l = DB.abastecimentos.filter(a => a.carroId === c.id && a.data.startsWith(mes())).sort((a, b) => b.data.localeCompare(a.data) || b.hodometro - a.hodometro);
  $('#totAbast').textContent = `${num(l.reduce((s, a) => s + a.litros, 0))} L · ${brl(l.reduce((s, a) => s + a.valor, 0))}`;
  $('#listAbast').innerHTML = l.map(a => `<div class="it"><div class="main"><b>${dBR(a.data)} <span class="pill ${a.combustivel === 'ETANOL' ? 'e' : 'g'}">${a.combustivel === 'ETANOL' ? 'Etanol' : 'Gasolina'}</span></b>
    <small>${num(a.hodometro, 0)} km · ${num(a.litros, 2)} L · ${brl(a.precoLitro)}/L${a.tanqueCheio ? ' · cheio' : ''}</small></div>
    <div class="val">${brl(a.valor)}</div>${bEd('abastecimentos', 'fAbast', a.id)}${bDel('abastecimentos', a.id)}</div>`).join('') || '<p class="empty">Nenhum abastecimento neste mês.</p>';
}
fAb.addEventListener('input', e => {
  const l = N(E(fAb, 'litros').value), p = N(E(fAb, 'precoLitro').value), v = N(E(fAb, 'valor').value);
  if (e.target.name === 'valor') { if (l && v) E(fAb, 'precoLitro').value = (v / l).toFixed(3); }
  else if (['litros', 'precoLitro'].includes(e.target.name) && l && p) E(fAb, 'valor').value = (l * p).toFixed(2);
});
E(fAb, 'carroId').addEventListener('change', () => { E(fAb, 'hodometro').value = ''; comb(); });

// ================================================================= Manutenção
const fMan = $('#fManut');
function manut() {
  const c = carroPadrao(), st = statsCarro(c), l = previsao(c, st), al = l.filter(m => m.status !== 'OK').length;
  $('#manutKpis').innerHTML = `<div class="kpi"><span>Hodômetro</span><b>${num(st.hod, 0)} km</b><small>${esc(c.nome)}</small></div>
    <div class="kpi"><span>Ritmo</span><b>${st.kmDia ? num(st.kmDia, 0) + ' km/dia' : '—'}</b><small>últimos 30 dias</small></div>
    <div class="kpi"><span>Reserva por km</span><b>${brl(st.manutKm)}</b><small>${st.manutMes ? '+ ' + brl(st.manutMes) + '/mês' : 'custo ÷ intervalo'}</small></div>
    <div class="kpi ${al ? 'warn' : 'ok'}"><span>Alertas</span><b>${al}</b><small>${al ? 'próximas ou vencidas' : 'tudo em dia'}</small></div>`;
  $('#listManut').innerHTML = l.map(m => `<div class="card mcard ${m.status}"><div class="head"><h3>${esc(m.item)}</h3><span class="pill ${STS[m.status][0]}">${STS[m.status][1]}</span></div>
    <div class="prog ${m.status}"><span style="width:${m.prog}%"></span></div>
    <div class="info">${[m.intervaloKm ? `a cada ${num(m.intervaloKm, 0)} km` : '', m.intervaloMeses ? `${m.intervaloMeses} meses` : ''].filter(Boolean).join(' ou ')} · última: ${num(m.ultimoKm, 0)} km em ${dBR(m.ultimaData)}<br>
      ${prevTxt(m)} · estimado <b>${brl(m.custoEstimado)}</b></div>
    <div class="acts"><button class="btn primary sm" data-act="feita" data-id="${m.id}">Registrar feita</button>${bEd('manutencoes', 'fManut', m.id)}${bDel('manutencoes', m.id)}</div></div>`).join('');
  if (!E(fMan, 'id').value) { if (!E(fMan, 'ultimoKm').value) E(fMan, 'ultimoKm').value = Math.round(st.hod); if (!E(fMan, 'ultimaData').value) E(fMan, 'ultimaData').value = hoje(); }
}
function planoSugerido(c) {
  [['Troca de óleo e filtro', 10000, 12, 400], ['Revisão programada', 10000, 12, 600], ['Alinhamento e balanceamento', 10000, 6, 150],
    ['Pastilhas de freio', 30000, 0, 450], ['Pneus (jogo com 4)', 40000, 0, 2400], ['Bateria', 0, 36, 550]]
    .forEach(([item, ik, im, v]) => DB.manutencoes.push({ id: novoId(), carroId: c.id, item, intervaloKm: ik, intervaloMeses: im, ultimoKm: c.hodometroInicial, ultimaData: hoje(), custoEstimado: v }));
}

// ================================================================= Mais (abas)
$$('#maisTabs button').forEach(b => b.addEventListener('click', () => { ABA = b.dataset.aba; mais(); }));
function mais() {
  $$('#maisTabs button').forEach(b => b.classList.toggle('active', b.dataset.aba === ABA));
  $$('.aba').forEach(a => a.hidden = a.id !== 'a-' + ABA);
  ({ carros: abaCarros, despesas: abaDesp, fixos: abaFixos, financ: abaFin, config: abaCfg })[ABA]();
}
function abaCarros() {
  $$('.novo').forEach(x => x.hidden = !!E($('#fCarro'), 'id').value);
  $('#listCarros').innerHTML = DB.carros.map(c => {
    const st = statsCarro(c), p = c.id === (carroPadrao() || {}).id;
    return `<div class="card"><div class="head"><h3>${esc(c.nome)} ${p ? '<span class="pill ok">Padrão</span>' : ''}</h3><div>${bEd('carros', 'fCarro', c.id)}${bDel('carros', c.id)}</div></div>
      <div class="info muted small">${esc([c.modelo, c.placa].filter(Boolean).join(' · '))}<br>${num(st.hod, 0)} km · combustível ${brl(st.custoKm)}/km · manutenção ${brl(st.manutKm)}/km</div>
      ${p ? '' : `<button class="btn ghost sm" style="margin-top:10px" data-act="padrao" data-id="${c.id}">Tornar padrão</button>`}</div>`;
  }).join('');
}
function abaDesp() {
  if (!E($('#fDesp'), 'data').value) E($('#fDesp'), 'data').value = hoje();
  const l = DB.despesas.filter(x => x.data.startsWith(mes())).sort((a, b) => b.data.localeCompare(a.data));
  $('#totDesp').textContent = brl(l.reduce((s, x) => s + x.valor, 0));
  $('#listDesp').innerHTML = l.map(x => `<div class="it"><div class="main"><b>${esc(x.categoria)}${x.manutencaoId ? ' <span class="pill info">plano</span>' : ''}</b><small>${dBR(x.data)} · ${esc(x.descricao || '—')}</small></div>
    <div class="val">${brl(x.valor)}</div>${bEd('despesas', 'fDesp', x.id)}${bDel('despesas', x.id)}</div>`).join('') || '<p class="empty">Nenhuma despesa neste mês.</p>';
}
function abaFixos() {
  const ob = obrigacoes();
  $('#listFixos').innerHTML = DB.rendas.map(r => `<div class="it"><div class="main"><b>${esc(r.descricao)}</b><small><span class="pill ok">renda</span></small></div><div class="val">${brl(r.valor)}</div>${bEd('rendas', 'fRenda', r.id)}${bDel('rendas', r.id)}</div>`).join('')
    + DB.custos.map(c => `<div class="it"><div class="main"><b>${esc(c.descricao)}</b><small><span class="pill ${c.pagoPor === 'UBER' ? 'warn' : 'info'}">pago com ${c.pagoPor === 'UBER' ? 'Uber' : 'renda'}</span></small></div><div class="val">− ${brl(c.valor)}</div>${bEd('custos', 'fCusto', c.id)}${bDel('custos', c.id)}</div>`).join('')
    + ob.itens.filter(i => i.d.startsWith('Parcelas')).map(i => `<div class="it"><div class="main"><b>${esc(i.d)}</b><small>do financiamento · pago com ${i.p === 'UBER' ? 'Uber' : 'renda'}</small></div><div class="val">− ${brl(i.v)}</div></div>`).join('')
    || '<p class="empty">Nada cadastrado.</p>';
}
function abaFin() {
  const f = $('#fFin'), c = achar('carros', E(f, 'carroId').value) || carroPadrao();
  if (!c) { $('#finBox').innerHTML = '<p class="empty">Cadastre um carro primeiro.</p>'; f.hidden = true; return; }
  const fin = c.financiamento; f.hidden = !!fin;
  if (!fin) { $('#finBox').innerHTML = ''; return; }
  const pend = fin.parcelas.filter(p => !p.paga).map(p => p.numero), porMes = fin.porRenda + fin.porUber;
  const meses = porMes ? Math.ceil(pend.length / porMes) : 0, q = new Date(); q.setMonth(q.getMonth() + Math.max(0, meses - 1));
  const sug = [], dq = [...pend], ori = [...Array(fin.porRenda).fill('RENDA'), ...Array(fin.porUber).fill('UBER')];
  ori.forEach((o, i) => { if (dq.length) sug.push({ n: i === 0 ? dq.shift() : dq.pop(), o, t: i === 0 ? 'Parcela do mês' : 'Amortização (de trás pra frente)' }); });
  const sN = new Set(sug.map(s => s.n)), pagas = fin.parcelas.length - pend.length;
  $('#finBox').innerHTML = `<div class="kpis"><div class="kpi"><span>Pagas</span><b>${pagas} de ${fin.parcelas.length}</b><small>${num(pagas / fin.parcelas.length * 100, 0)}%</small></div>
      <div class="kpi"><span>Restantes</span><b>${pend.length}</b><small>${brl(pend.length * fin.valorParcela)} nominal</small></div>
      <div class="kpi"><span>Ritmo</span><b>${porMes}/mês</b><small>${fin.porRenda} renda + ${fin.porUber} Uber</small></div>
      <div class="kpi ok"><span>Quitação</span><b>${pend.length ? mesBR(q.toISOString().slice(0, 7)) : 'Quitado 🎉'}</b><small>${meses} meses (sem amortizar: ${pend.length})</small></div></div>
    <div class="card"><h3>Plano deste mês</h3><div class="list">${sug.map(s => `<div class="it"><div class="main"><b>Parcela ${s.n}</b><small>${s.t}</small></div>
      <span class="pill ${s.o === 'UBER' ? 'ok' : 'info'}">${s.o === 'UBER' ? 'Uber' : 'Renda'}</span><button class="btn ghost sm" data-act="parcela" data-id="${s.n}" data-origem="${s.o}">Pagar</button></div>`).join('') || '<p class="empty">Tudo quitado!</p>'}</div></div>
    <div class="card"><h3>Mapa de parcelas</h3><div class="parcelas">${fin.parcelas.map(p => `<div class="parc ${p.paga ? p.origem : ''} ${sN.has(p.numero) ? 'sug' : ''}" data-act="parcela" data-id="${p.numero}">${p.numero}</div>`).join('')}</div>
      <button class="btn danger sm" style="margin-top:14px" data-act="remover-fin">Remover financiamento</button></div>`;
}
function abaCfg() {
  for (const el of $('#fCfg').elements) if (el.name) el.value = DB.config[el.name];
  $('#ultBackup').textContent = DB.ultimoBackup ? 'Último backup: ' + dBR(DB.ultimoBackup) : 'Nenhum backup exportado ainda.';
}

// ================================================================= Formulários (CRUD)
function ler(f) { const b = {}; for (const el of f.elements) { if (!el.name) continue; if (el.type === 'checkbox') b[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) b[el.name] = el.value; } else b[el.name] = el.value; } return b; }
function preencher(f, o) { for (const el of f.elements) { if (!el.name || !(el.name in o)) continue; if (el.type === 'checkbox') el.checked = !!o[el.name]; else if (el.type === 'radio') el.checked = el.value === String(o[el.name]); else el.value = o[el.name] ?? ''; } }
const TIT = { fDia: 'Iniciar dia', fAbast: 'Registrar abastecimento', fManut: 'Novo item de manutenção', fCarro: 'Cadastrar carro', fDesp: 'Nova despesa', fRenda: 'Nova renda fixa', fCusto: 'Novo custo fixo' };
function sairEdicao(f) {
  const fid = f.getAttribute('id');
  f.reset(); E(f, 'id').value = ''; $('#' + fid + 'T').textContent = TIT[fid];
  f.querySelector('[data-act=cancelar]').hidden = true;
  if (fid === 'fDia') toggleFim();
}
function editar(col, fid, id) {
  const it = achar(col, id), f = $('#' + fid); if (!it) return;
  f.reset(); f.hidden = false; preencher(f, it); E(f, 'id').value = id;
  $('#' + fid + 'T').textContent = 'Editar';
  f.querySelector('[data-act=cancelar]').hidden = false;
  if (fid === 'fDia') { E(f, 'fechado').checked = it.status === 'FECHADO'; toggleFim(); $('#fDiaBtn').textContent = 'Salvar alterações'; }
  if (fid === 'fCarro') $$('.novo').forEach(x => x.hidden = true);
  f.scrollIntoView({ behavior: 'smooth' });
}
const VALID = {
  dias: validarDia,
  abastecimentos: b => {
    const car = achar('carros', b.carroId) || falha('Selecione um carro.'), l = N(b.litros); let v = N(b.valor);
    if (l <= 0) falha('Informe os litros.'); if (v <= 0 && N(b.precoLitro) > 0) v = N(b.precoLitro) * l; if (v <= 0) falha('Informe o valor.');
    if (N(b.hodometro) <= 0) falha('Informe o hodômetro.');
    return { carroId: car.id, data: b.data || hoje(), combustivel: b.combustivel === 'GASOLINA' ? 'GASOLINA' : 'ETANOL', litros: r2(l), valor: r2(v), precoLitro: Math.round(v / l * 1000) / 1000, hodometro: N(b.hodometro), tanqueCheio: !!b.tanqueCheio };
  },
  manutencoes: b => {
    const car = achar('carros', b.carroId) || falha('Selecione um carro.');
    if (!b.item.trim()) falha('Informe o item.'); if (N(b.intervaloKm) <= 0 && N(b.intervaloMeses) <= 0) falha('Informe o intervalo em km e/ou meses.');
    return { carroId: car.id, item: b.item.trim(), intervaloKm: N(b.intervaloKm), intervaloMeses: N(b.intervaloMeses), ultimoKm: N(b.ultimoKm) || car.hodometroInicial, ultimaData: b.ultimaData || hoje(), custoEstimado: N(b.custoEstimado) };
  },
  carros: b => {
    if (!b.nome.trim()) falha('Informe o nome do carro.'); if (N(b.hodometroInicial) < 0) falha('Hodômetro inválido.');
    return { nome: b.nome.trim(), modelo: b.modelo.trim(), placa: b.placa.trim().toUpperCase(), hodometroInicial: N(b.hodometroInicial), consumoEtanol: N(b.consumoEtanol) || 8.7, consumoGasolina: N(b.consumoGasolina) || 12 };
  },
  despesas: b => { if (N(b.valor) <= 0) falha('Informe o valor.'); return { data: b.data || hoje(), categoria: b.categoria, descricao: b.descricao.trim(), valor: r2(N(b.valor)) }; },
  rendas: b => { if (!b.descricao.trim() || N(b.valor) <= 0) falha('Informe descrição e valor.'); return { descricao: b.descricao.trim(), valor: r2(N(b.valor)) }; },
  custos: b => { if (!b.descricao.trim() || N(b.valor) <= 0) falha('Informe descrição e valor.'); return { descricao: b.descricao.trim(), valor: r2(N(b.valor)), pagoPor: b.pagoPor === 'RENDA' ? 'RENDA' : 'UBER' }; }
};
function crud(fid, col, msg) {
  const f = $('#' + fid);
  f.addEventListener('submit', e => {
    e.preventDefault();
    const b = ler(f), id = Number(b.id) || 0;
    try {
      if (fid === 'fDia' && !b.fechado) { b.hodometroFinal = 0; b.horaFim = ''; }
      const item = VALID[col](b, id);
      if (id) { const atual = achar(col, id); Object.assign(atual, item); }
      else {
        const novo = { id: novoId(), ...item }; DB[col].push(novo);
        if (col === 'carros') { if (!achar('carros', DB.config.carroPadrao)) DB.config.carroPadrao = novo.id; if (b.planoSugerido) planoSugerido(novo); }
      }
      salvar(); sairEdicao(f);
      toast(id ? 'Alterações salvas ✔' : typeof msg === 'function' ? msg(item) : msg); render();
    } catch (er) { if (er instanceof Erro) toast(er.message, true); else throw er; }
  });
}
crud('fDia', 'dias', it => it.status === 'ABERTO' ? 'Dia iniciado. Bom trabalho! 🚗' : 'Dia salvo ✔');
crud('fAbast', 'abastecimentos', 'Abastecimento salvo ✔');
crud('fManut', 'manutencoes', 'Item salvo ✔');
crud('fCarro', 'carros', 'Carro salvo ✔');
crud('fDesp', 'despesas', 'Despesa salva ✔');
crud('fRenda', 'rendas', 'Renda salva ✔');
crud('fCusto', 'custos', 'Custo salvo ✔');

$('#fFin').addEventListener('submit', e => {
  e.preventDefault();
  const b = ler(e.target), c = achar('carros', b.carroId), tot = N(b.totalParcelas), v = N(b.valorParcela);
  if (!c || tot < 2 || tot > 120 || v <= 0) return toast('Confira valor e total de parcelas (2 a 120).', true);
  c.financiamento = { valorParcela: v, porRenda: N(b.porRenda), porUber: N(b.porUber),
    parcelas: Array.from({ length: tot }, (_, i) => { const n = i + 1, paga = b.pagasIniciais === 'PU' ? (n === 1 || n === tot) : b.pagasIniciais === 'P' ? n === 1 : false;
      return { numero: n, paga, origem: paga ? 'RENDA' : '', data: paga ? hoje() : '', valor: paga ? v : 0 }; }) };
  salvar(); toast('Plano criado ✔'); render();
});
$('#fCfg').addEventListener('submit', e => {
  e.preventDefault();
  for (const el of e.target.elements) if (el.name) DB.config[el.name] = Math.max(0, N(el.value));
  if (!DB.config.propE && !DB.config.propG) DB.config.propE = 1;
  salvar(); toast('Ajustes salvos ✔'); render();
});

// ================================================================= Ações por clique
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = Number(el.dataset.id);
  switch (el.dataset.act) {
    case 'ir': if (el.dataset.aba) ABA = el.dataset.aba; ir(el.dataset.view); break;
    case 'guia': localStorage.setItem('rf.guia', '1'); render(); break;
    case 'editar': editar(el.dataset.col, el.dataset.form, id); break;
    case 'cancelar': sairEdicao($('#' + el.dataset.form)); render(); break;
    case 'excluir': {
      const col = el.dataset.col;
      if (!confirm(col === 'carros' ? 'Excluir o carro e todos os dias, abastecimentos e manutenções dele?' : 'Excluir este registro?')) break;
      DB[col] = DB[col].filter(x => x.id !== id);
      if (col === 'carros') { for (const c of ['dias', 'abastecimentos', 'manutencoes']) DB[c] = DB[c].filter(x => x.carroId !== id); if (DB.config.carroPadrao === id) DB.config.carroPadrao = (DB.carros[0] || {}).id || 0; }
      salvar(); toast('Excluído'); render(); break;
    }
    case 'padrao': DB.config.carroPadrao = id; salvar(); render(); break;
    case 'feita': abrirFeita(id); break;
    case 'parcela': abrirParcela(id, el.dataset.origem); break;
    case 'remover-fin': { const c = achar('carros', E($('#fFin'), 'carroId').value) || carroPadrao(); if (confirm('Remover o financiamento?')) { delete c.financiamento; salvar(); render(); } break; }
    case 'exportar': exportar(); break;
    case 'apagar':
      if (confirm('Apagar TODOS os dados deste aparelho?') && confirm('Tem certeza? Sem backup, não há como recuperar.')) { localStorage.removeItem(CHAVE); carregarDB(); render(); toast('Dados apagados'); }
      break;
  }
});
function abrirFeita(id) {
  const m = achar('manutencoes', id), f = $('#fFeita'), d = $('#dlgFeita');
  f.reset(); $('#dlgFeitaT').textContent = m.item; E(f, 'data').value = hoje();
  E(f, 'hodometro').value = Math.round(statsCarro(achar('carros', m.carroId)).hod); E(f, 'custo').value = m.custoEstimado;
  d.returnValue = '';
  d.onclose = () => {
    if (d.returnValue !== 'ok') return;
    const b = ler(f), custo = N(b.custo);
    if (custo > 0) DB.despesas.push({ id: novoId(), data: b.data, categoria: 'Manutenção', descricao: m.item, valor: r2(custo), manutencaoId: m.id });
    m.ultimoKm = N(b.hodometro); m.ultimaData = b.data; if (custo > 0) m.custoEstimado = custo;
    salvar(); toast('Manutenção registrada ✔'); render();
  };
  d.showModal();
}
function abrirParcela(n, origem) {
  const c = achar('carros', E($('#fFin'), 'carroId').value) || carroPadrao(), p = c.financiamento.parcelas[n - 1], f = $('#fParcela'), d = $('#dlgParcela');
  $('#dlgParcelaT').textContent = `Parcela ${n} de ${c.financiamento.parcelas.length}`;
  $(((p.paga ? p.origem : origem) || 'RENDA') === 'UBER' ? '#oU' : '#oR').checked = true;
  E(f, 'data').value = p.data || hoje(); E(f, 'valor').value = p.paga ? p.valor : c.financiamento.valorParcela;
  $('#btnDesm').hidden = !p.paga; d.returnValue = '';
  d.onclose = () => {
    if (!['pagar', 'desmarcar'].includes(d.returnValue)) return;
    const b = ler(f), pagar = d.returnValue === 'pagar';
    Object.assign(p, { paga: pagar, origem: pagar ? b.origem : '', data: pagar ? b.data : '', valor: pagar ? N(b.valor) : 0 });
    salvar(); toast(pagar ? `Parcela ${n} paga ✔` : `Parcela ${n} desmarcada`); render();
  };
  d.showModal();
}

// ================================================================= Backup
async function exportar() {
  DB.ultimoBackup = hoje(); salvar();
  const nome = `rodafin-backup-${hoje()}.json`, blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
  const file = new File([blob], nome, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Backup RodaFin' }); render(); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); URL.revokeObjectURL(a.href);
  render();
}
$('#importar').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.carros) || !d.config) throw new Error();
    if (!confirm('Importar este backup? Os dados atuais serão substituídos.')) return;
    localStorage.setItem(CHAVE, JSON.stringify(d)); carregarDB(); toast('Backup importado ✔'); ir('painel');
  } catch { toast('Arquivo de backup inválido.', true); }
});

// Máscara hh:mm nas pausas
document.addEventListener('input', e => {
  if (!e.target.classList.contains('dur')) return;
  const d = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = d.length > 2 ? d.slice(0, -2) + ':' + d.slice(-2) : d;
});
document.addEventListener('blur', e => {
  if (!e.target.classList || !e.target.classList.contains('dur')) return;
  const d = e.target.value.replace(/\D/g, ''); const n = (d || '0').padStart(4, '0').slice(-4);
  e.target.value = n.slice(0, 2) + ':' + n.slice(2);
}, true);

// ================================================================= Início
carregarDB();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
$('#mesSel').value = hoje().slice(0, 7);
ir(diaAberto() ? 'dias' : 'painel');
addEventListener('resize', () => VIEW === 'painel' && DB.carros.length && grafico(resumo(mes())));
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
