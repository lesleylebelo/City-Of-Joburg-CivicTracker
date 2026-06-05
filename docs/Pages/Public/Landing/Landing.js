// HERO LIVE TYPING LOOP
const heroText = document.querySelector(".hero-text");

const heroMessages = [
    "Community Transparency & Monitoring System",
    "Report • Track • Improve",
    "Building a Transparent City",
    "Civic Accountability in Real Time"
];

let msgIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeHeroLoop() {
    const currentText = heroMessages[msgIndex];

    if (!isDeleting) {
        heroText.textContent = currentText.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === currentText.length) {
            isDeleting = true;
            setTimeout(typeHeroLoop, 1800); // pause at full text
            return;
        }
    } else {
        heroText.textContent = currentText.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
            isDeleting = false;
            msgIndex = (msgIndex + 1) % heroMessages.length;
        }
    }

    setTimeout(typeHeroLoop, isDeleting ? 40 : 80);
}

typeHeroLoop();