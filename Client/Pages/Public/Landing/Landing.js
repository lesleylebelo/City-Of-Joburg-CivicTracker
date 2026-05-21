const header = document.querySelector("header");

window.addEventListener("scroll", function () {
    if (window.scrollY > 60) {
        header.style.background = "rgba(20, 20, 20, 0.98)";
        header.style.borderBottomColor = "rgba(245, 197, 24, 0.35)";
    } else {
        header.style.background = "rgba(30, 30, 30, 0.95)";
        header.style.borderBottomColor = "rgba(245, 197, 24, 0.2)";
    }
});

const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll("#Navigation-Bar a[href^='#']");

function highlightActiveNavLink() {
    let scrollPosition = window.scrollY + 100;

    sections.forEach(function (section) {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute("id");

        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
            navLinks.forEach(function (link) {
                link.style.color = "";
                if (link.getAttribute("href") === "#" + sectionId) {
                    link.style.color = "#F5C518";
                }
            });
        }
    });
}

window.addEventListener("scroll", highlightActiveNavLink);

navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
        e.preventDefault();
        const targetId = link.getAttribute("href").substring(1);
        const targetSection = document.getElementById(targetId);

        if (targetSection) {
            const offsetTop = targetSection.offsetTop - 80;
            window.scrollTo({
                top: offsetTop,
                behavior: "smooth"
            });
        }
    });
});

const revealElements = document.querySelectorAll(
    "#UseCase-Card1, #UseCase-Card2, #UseCase-Card3, " +
    "#Features-Card1, #Features-Card2, #Features-Card3, " +
    "#Features-Card4, #Features-Card5, #Features-Card6, " +
    "#photoDevelopment1, #photoDevelopment2, #photoPothole"
);

revealElements.forEach(function (el) {
    el.style.opacity = "0";
    el.style.transform = "translateY(28px)";
    el.style.transition = "opacity 0.55s ease, transform 0.55s ease";
});

function revealOnScroll() {
    revealElements.forEach(function (el) {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight - 80;

        if (isVisible) {
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
        }
    });
}

window.addEventListener("scroll", revealOnScroll);
revealOnScroll();
