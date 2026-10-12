/* ==========================================================================
   XZ TRADERS · Landing
   ========================================================================== */

/*
 * ENLACES DEL SITIO
 * Cambia aquí tus enlaces y se actualizan en toda la página.
 */
const LINKS = {
  lbank: 'https://www.lbank.com/ref/62R2M', // Enlace de referido de LBANK
  telegram: 'https://t.me/xztraders_aibot', // Bot de Telegram para enviar el UID y entrar
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
  const finalCta = document.querySelector('.cta-final');
  let finalVisible = false;

  const update = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 24);
    const pastHero = y > hero.offsetHeight * 0.75;
    mobileCta.classList.toggle('is-visible', pastHero && !finalVisible);
  };

  // Ocultar la barra fija cuando el CTA final ya está en pantalla.
  if ('IntersectionObserver' in window && finalCta) {
    new IntersectionObserver(([entry]) => {
      finalVisible = entry.isIntersecting;
      update();
    }).observe(finalCta);
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

function initYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
}

applyLinks();
initNav();
initReveal();
initCounters();
initFeatureGlow();
initYear();
