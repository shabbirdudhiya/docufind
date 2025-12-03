// Smooth reveal animations on scroll
document.addEventListener("DOMContentLoaded", () => {
  // Typing animation for search demo
  const typingText = document.querySelector(".typing-text");
  const searchTerms = [
    "quarterly report",
    "project proposal",
    "meeting notes",
    "budget 2025",
  ];
  let termIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typeSpeed = 100;

  function typeEffect() {
    const currentTerm = searchTerms[termIndex];

    if (isDeleting) {
      typingText.textContent = currentTerm.substring(0, charIndex - 1);
      charIndex--;
      typeSpeed = 50;
    } else {
      typingText.textContent = currentTerm.substring(0, charIndex + 1);
      charIndex++;
      typeSpeed = 100;
    }

    if (!isDeleting && charIndex === currentTerm.length) {
      isDeleting = true;
      typeSpeed = 2000; // Pause at end
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      termIndex = (termIndex + 1) % searchTerms.length;
      typeSpeed = 500; // Pause before typing new word
    }

    setTimeout(typeEffect, typeSpeed);
  }

  setTimeout(typeEffect, 1000);

  // Intersection Observer for fade-in animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe elements for animation
  document
    .querySelectorAll(".feature-card, .step, .download-card")
    .forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
      observer.observe(el);
    });

  // Add visible class styles
  const style = document.createElement("style");
  style.textContent = `
        .visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
  document.head.appendChild(style);

  // Stagger animation for feature cards
  document.querySelectorAll(".feature-card").forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.1}s`;
  });

  // Smooth scroll for navigation links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Parallax effect for orbs
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrolled = window.pageYOffset;
        const orbs = document.querySelectorAll(".orb");
        orbs.forEach((orb, index) => {
          const speed = 0.1 + index * 0.05;
          orb.style.transform = `translateY(${scrolled * speed}px)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  });

  // Result item hover effect
  document.querySelectorAll(".result-item").forEach((item) => {
    item.addEventListener("mouseenter", () => {
      item.style.background =
        "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "";
    });
  });

  // Track download clicks (optional analytics)
  document.querySelectorAll(".download-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const platform = btn.classList.contains("windows") ? "Windows" : "macOS";
      console.log(`Download clicked: ${platform}`);
      // Add your analytics tracking here if needed
    });
  });

  // Add keyboard navigation hint
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Close any modals if you add them later
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      window.location.href = "#download";
    }
  });

  // Console easter egg
  console.log(`
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║   🔍 DocuFind                         ║
    ║                                       ║
    ║   Thanks for checking us out!         ║
    ║   Star us on GitHub:                  ║
    ║   github.com/shabbirdudhiya/docufind  ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
    `);
});

// Detect OS for smart download button
function detectOS() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("mac")) return "macos";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

// Highlight primary download based on OS
document.addEventListener("DOMContentLoaded", () => {
  const os = detectOS();
  const downloadBtns = document.querySelectorAll(".download-btn");

  downloadBtns.forEach((btn) => {
    if (btn.classList.contains(os)) {
      btn.style.borderColor = "var(--accent-blue)";
      btn.style.boxShadow = "0 0 20px rgba(59, 130, 246, 0.2)";
    }
  });
});
