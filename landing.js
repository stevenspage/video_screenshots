(function () {
    // Fill in these paths after you add real images to the project.
    // Leave a value empty to keep showing the placeholder block.
    // hero: 精听主界面
    // editor: 精听操作界面
    // detail: 字幕切换 / 搜索 / 遮罩细节
    // subtitlePoster: 台词复习海报
    // storyboard: 连续画面复习长图
    // banner: 精听学习氛围横幅
    var landingImages = {
        hero: "screenshots_demo/3_main_ui_2.png",
        editor: "",
        subtitlePoster: "",
        detail: "",
        storyboard: "screenshots_demo/1_continuous_sub.png",
        banner: "screenshots_demo/5_mask.gif"
    };

    var yearNode = document.getElementById("year");
    if (yearNode) {
        yearNode.textContent = String(new Date().getFullYear());
    }

    var mediaNodes = document.querySelectorAll(".configurable-media[data-image-key]");
    mediaNodes.forEach(function (node) {
        var key = node.getAttribute("data-image-key");
        var src = landingImages[key];
        if (!src) {
            return;
        }

        var img = document.createElement("img");
        img.className = "media-image";
        img.alt = node.getAttribute("data-image-alt") || "";
        img.loading = "lazy";
        img.decoding = "async";

        var fit = node.getAttribute("data-image-fit");
        if (fit) {
            node.style.setProperty("--image-fit", fit);
        }

        var hasLoaded = false;
        function markLoaded() {
            if (hasLoaded) {
                return;
            }
            hasLoaded = true;

            if ((key === "storyboard" || key === "hero") && img.naturalWidth > 0 && img.naturalHeight > 0) {
                node.style.setProperty("--ratio", img.naturalWidth + " / " + img.naturalHeight);
            }

            node.classList.add("has-image");
        }

        node.insertBefore(img, node.firstChild);

        img.addEventListener("load", markLoaded);

        img.addEventListener("error", function () {
            node.classList.remove("has-image");
            if (img.parentNode === node) {
                node.removeChild(img);
            }
        });

        img.src = src;

        if (img.complete && img.naturalWidth > 0) {
            markLoaded();
        }
    });

    var revealNodes = document.querySelectorAll(".reveal");
    if (!revealNodes.length) {
        return;
    }

    if (!("IntersectionObserver" in window)) {
        revealNodes.forEach(function (node) {
            node.classList.add("is-visible");
        });
        return;
    }

    var observer = new IntersectionObserver(
        function (entries, io) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }
                entry.target.classList.add("is-visible");
                io.unobserve(entry.target);
            });
        },
        {
            threshold: 0.18,
            rootMargin: "0px 0px -8% 0px"
        }
    );

    revealNodes.forEach(function (node) {
        observer.observe(node);
    });
})();
