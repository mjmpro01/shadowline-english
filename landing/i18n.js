// The landing page's two small jobs for JavaScript: sending a visitor to the
// language they read, and letting sections fade in as they scroll into view.
// Everything works without it. Each language is its own page — / in English,
// /vi/ in Vietnamese (built by scripts/build-vi.mjs) — so crawlers read both.
;(function () {
  'use strict'

  var STORAGE_KEY = 'shadowline.landing.lang'
  var PAGES = { en: '/', vi: '/vi/' }
  var here = document.documentElement.lang === 'vi' ? 'vi' : 'en'

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      return null
    }
  }

  function remember(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch (e) {
      /* a private window still switches, it just will not remember */
    }
  }

  // A link with ?lang= (the old way to pick one) or a choice made here before
  // wins; otherwise the browser's own language, but only on the English page:
  // anyone who reached /vi/ asked for it.
  function wanted() {
    var asked = new URLSearchParams(location.search).get('lang')
    if (asked in PAGES) {
      remember(asked)
      return asked
    }
    var saved = stored()
    if (saved in PAGES) return saved
    if (here !== 'en') return here
    var langs = navigator.languages || [navigator.language || 'en']
    for (var i = 0; i < langs.length; i++) {
      var base = String(langs[i]).toLowerCase().split('-')[0]
      if (base in PAGES) return base
    }
    return here
  }

  var lang = wanted()
  if (lang !== here) {
    location.replace(PAGES[lang] + location.hash)
    return
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('[data-lang]')
    if (link) remember(link.getAttribute('data-lang'))
  })

  var year = document.getElementById('year')
  if (year) year.textContent = String(new Date().getFullYear())

  // Sections ease in as they arrive. Marked here rather than in the HTML so a
  // browser without JavaScript never hides anything.
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js')
    var targets = document.querySelectorAll(
      '.section-head, .step, .feature, .split > *, .safe, .faq details, .final-inner',
    )
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('reveal')
      observer.observe(el)
    })
  }
})()
