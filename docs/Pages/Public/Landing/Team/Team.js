// CIVICTRACK - MEET THE TEAM JAVASCRIPT

// ── Header scroll effect ──
const header = document.querySelector("header");

window.addEventListener("scroll", function () {
    if (window.scrollY > 40) {
        header.style.borderBottomColor = "rgba(245, 197, 24, 0.35)";
    } else {
        header.style.borderBottomColor = "rgba(245, 197, 24, 0.2)";
    }
});

// ── Fallback: scroll reveal for cards (in case CSS animation doesn't trigger) ──
const cards = document.querySelectorAll(".team-card");

function revealCards() {
    cards.forEach(function (card) {
        const rect = card.getBoundingClientRect();
        if (rect.top < window.innerHeight - 60) {
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        }
    });
}

window.addEventListener("scroll", revealCards);
revealCards();
