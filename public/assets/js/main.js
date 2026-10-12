/* ==========================================================================
   XZ TRADERS · Landing
   ========================================================================== */

/*
 * ENLACES DEL SITIO
 * Cambia aquí tus enlaces y se actualizan en toda la página.
 */
const LINKS = {
  lbank: 'https://www.lbank.com/ref/62R2M', // Enlace de referido de LBANK
  telegram: 'https://t.me/xztraders_aibot', // Bot de Telegram para dudas
};

// Dirección de la función que comprueba el UID (netlify/functions/verify.mjs).
const VERIFY_URL = '/api/verify';

/*
 * MENSAJES DE LA VERIFICACIÓN
 * `action` añade un botón que usa uno de los enlaces de arriba.
 */
const VERIFY_MESSAGES = {
  invalid_uid: {
    title: 'Revisa tu UID',
    text: 'El UID de LBANK empieza por LBA, por ejemplo: LBA32323. Cópialo tal cual de tu perfil.',
  },
  not_registered: {
    title: 'Esta cuenta no está registrada con mi enlace',
    text: 'Crea una cuenta nueva en LBANK con mi enlace, deposita al menos 101 USDT y vuelve a probar.',
    action: { label: 'Abrir LBANK', link: 'lbank' },
  },
  not_direct: {
    title: 'Esta cuenta no se creó con mi enlace',
    text: 'Para conseguir el indicador tienes que registrarte directamente con mi enlace de LBANK.',
    action: { label: 'Abrir LBANK', link: 'lbank' },
  },
  low_deposit: {
    title: 'Aún no llegas a 101 USDT depositados',
    text: 'Deposita al menos 101 USDT en tu cuenta de LBANK. Si acabas de hacerlo, espera unos minutos y vuelve a probar.',
  },
  rate_limited: {
    title: 'Demasiados intentos',
    text: 'Espera un minuto y vuelve a probar.',
  },
  unavailable: {
    title: 'No hemos podido comprobarlo ahora',
    text: 'Inténtalo de nuevo en unos minutos. Si sigue fallando, escribe a nuestro bot de Telegram.',
    action: { label: 'Abrir Telegram', link: 'telegram' },
  },
};

function applyLinks() {
  document.querySelectorAll('[data-link]').forEach((el) => {
    const url = LINKS[el.dataset.link];
    if (!url) return; // Sin enlace: el botón se queda apuntando a "Cómo entrar".
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener';
  });
}

function initNav() {
  const nav = document.getElementById('nav');
  const mobileCta = document.getElementById('mobile-cta');
  const hero = document.querySelector('.hero');
  const targets = document.querySelectorAll('.verify-section, .cta-final');
  const visible = new Set();

  const update = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 24);
    const pastHero = y > hero.offsetHeight * 0.75;
    mobileCta.classList.toggle('is-visible', pastHero && visible.size === 0);
  };

  // Ocultar la barra fija cuando el formulario o el CTA final ya están en pantalla.
  if ('IntersectionObserver' in window && targets.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      update();
    });
    targets.forEach((el) => io.observe(el));
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

function initReveal() {
  const items = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  // Escalonar elementos hermanos (tarjetas en una misma fila).
  items.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    const index = siblings.indexOf(el);
    if (siblings.length > 1) el.style.setProperty('--delay', `${Math.min(index, 5) * 0.07}s`);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );

  items.forEach((el) => io.observe(el));
}

function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  const animate = (el) => {
    const target = Number(el.dataset.count);
    const duration = 1400;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );

  counters.forEach((el) => io.observe(el));
}

// Brillo que sigue al cursor en las tarjetas de "Qué incluye".
function initFeatureGlow() {
  document.querySelectorAll('.feature').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

// Formulario: comprobar el UID y mostrar el enlace del indicador.
function initVerify() {
  const form = document.getElementById('verify-form');
  const result = document.getElementById('verify-result');
  if (!form || !result) return;

  const input = form.elements.uid;
  const button = form.querySelector('button[type="submit"]');
  const UID_PATTERN = /^(LBA[0-9A-Z]{3,16}|\d{5,20})$/;

  const icon = (id) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  };

  const render = (kind, title, text, action) => {
    const box = document.createElement('div');
    box.className = `notice notice--${kind}`;
    const body = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    body.append(strong, p);
    if (action) body.append(action);
    box.append(icon(kind === 'ok' ? 'i-check' : 'i-alert'), body);
    result.replaceChildren(box);
  };

  const linkButton = (label, href, light) => {
    const a = document.createElement('a');
    a.className = `btn ${light ? 'btn--light' : 'btn--ghost'} btn--sm`;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    a.append(icon('i-arrow'));
    return a;
  };

  const showError = (code) => {
    const msg = VERIFY_MESSAGES[code] || VERIFY_MESSAGES.unavailable;
    const action = msg.action && LINKS[msg.action.link] ? linkButton(msg.action.label, LINKS[msg.action.link]) : null;
    render('error', msg.title, msg.text, action);
  };

  const isSafeUrl = (url) => {
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return false;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const uid = input.value.replace(/\s+/g, '').toUpperCase();
    input.value = uid;

    if (!UID_PATTERN.test(uid)) {
      showError('invalid_uid');
      input.focus();
      return;
    }

    form.classList.add('is-loading');
    button.disabled = true;
    result.replaceChildren();

    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.ok && isSafeUrl(data.url)) {
        render(
          'ok',
          '¡Todo listo! Ya puedes usar el indicador.',
          'Tu cuenta está verificada. Se abre en TradingView: pulsa «Utilizar en el gráfico» y añádelo a favoritos para tenerlo siempre a mano.',
          linkButton('Abrir en TradingView', data.url, true)
        );
      } else {
        showError(data.code);
      }
    } catch {
      showError('unavailable');
    } finally {
      form.classList.remove('is-loading');
      button.disabled = false;
    }
  });
}

function initYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
}

applyLinks();
initNav();
initReveal();
initCounters();
initFeatureGlow();
initVerify();
initYear();
