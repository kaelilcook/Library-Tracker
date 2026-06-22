// JavaScript source code
// ========================
// APP STATE
// ========================

let myLibrary = [];

let readingLog = [];

let shelves = [
    {
        name: "Kaeli",
        color: "#8b4c5c"
    },
    {
        name: "Garrett",
        color: "#5c7a8b"
    },
    {
        name: "Kids",
        color: "#6a8b5c"
    },
    {
        name: "To Buy",
        color: "#c7a44c"
    },
    {
        name: "From the Library",
        color: "#b85c5c"
    }
];

const shelfColors = [
    "#8b4c5c", // plum
    "#5c7a8b", // blue
    "#6a8b5c", // green
    "#c7a44c", // gold
    "#c47d42", // orange
    "#b85c5c", // red
    "#8b6f5c", // brown
    "#777777"  // gray
];

const supabaseClient = window.supabase.createClient(
    "https://bkjvdyvosoqyiorpkhvy.supabase.co",
    "sb_publishable_eETwZqxup4vZT08dKX8iMA_kug-Fz_H"
);

let activeShelf = "All";

let currentEditId = null;

let lastSearchQuery = "";


// ========================
// CONFIG
// ========================



if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(reg => console.log("SW registered", reg))
            .catch(err => console.error("SW registration failed", err));
    });
}

function upgradeUrl(url) {
    if (!url) return "";
    return url.replace("http://", "https://");
}


// ========================
// DOM ELEMENTS
// ========================

const elements = {

    // library
    library:
        document.getElementById("library"),

    searchInput:
        document.getElementById("searchInput"),

    searchBtn:
        document.getElementById("searchBtn"),

    searchResults:
        document.getElementById("searchResults"),

    // shelves
    addShelfBtn:
        document.getElementById("addShelfBtn"),

    // edit modal
    editSection:
        document.getElementById("editSection")

};

const today = new Date();
window.calendarMonth ??= today.getMonth();
window.calendarYear ??= today.getFullYear();





// 2 Helpers (reusable functions)

// ========================
// CORE UTILITIES
// ========================

function debounce(func, delay) {
    let timeout;

    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function findBook(id) {
    return myLibrary.find(
        b => b?.id && String(b.id) === String(id)
    );
}

// ========================
// STORAGE
// ========================

function saveLibrary() {
    // Supabase is now source of truth
    console.log("Save handled by Supabase");
}

async function loadLibrary() {

    console.log("Loading from Supabase...");

    const { data, error } = await supabaseClient
    .from("books")
    .select("*")
    .order("date_added", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    console.log("Books loaded:", data);

    myLibrary = data || [];

    renderLibrary();
    renderStats?.();
    loadReadingLog();
}

async function loadReadingLog() {

    const { data, error } = await supabaseClient
        .from("reading_log")
        .select("*");

    if (error) {
        console.error(error);
        return;
    }

    readingLog = data.map(row => ({
        date: row.date,
        books: row.books || []
    }));
}


async function exportLibrary() {

    const { data, error } = await supabaseClient
        .from("books")
        .select("*");

    if (error) {
        console.error(error);
        alert("Failed to export library.");
        return;
    }

    if (!data || data.length === 0) {
        alert("No library data found.");
        return;
    }

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "myLibrary-export.json";
    a.click();

    URL.revokeObjectURL(url);
}

async function importLibraryFile(file) {
    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const json = JSON.parse(e.target.result);

            if (!Array.isArray(json)) {
                alert("Invalid file format. Expected an array.");
                return;
            }

            // 🧼 CLEAN STEP (THIS IS WHAT YOU WERE MISSING)
            const cleaned = json.map(book => ({
                title: book.title,
                author: book.author,
                isbn: book.isbn,
                genre: book.genre,
                series: book.series,
                notes: book.notes,
                cover: book.cover,

                rating:
    book.rating === "" || book.rating == null
        ? null
        : Number(book.rating) || null,

                shelves: book.shelves || [],
                reading_history:
    book.reading_history ||
    book.readingHistory ||
    [],
                tags: book.tags || [],
                status: book.status,
                date_added:
    book.date_added ??
    book.dateAdded ??
    null,
            }));

            const { error } = await supabaseClient
                .from("books")
                .insert(cleaned);

            if (error) {
                console.error(error);
                alert("Import failed.");
                return;
            }

            alert("Library imported successfully!");
await loadLibrary();
await loadReadingLog();

        } catch (err) {
            alert("Invalid JSON file.");
            console.error(err);
        }
    };

    reader.readAsText(file);
}

// ========================
// MODALS
// ========================

function countBy(keyFn) {
    const counts = {};

    myLibrary.forEach(b => {
        const key = keyFn(b) || "Unknown";
        counts[key] = (counts[key] || 0) + 1;
    });

    return counts;
}

function percent(part, total) {
    return total ? Math.round((part / total) * 100) : 0;
}

function closeModal(modalId) {

    const modal = document.getElementById(modalId);

    if (!modal) return;

    modal.style.display = "none";
}

// ========================
// BOOK DATA
// ========================
function fuzzyMatch(text, query) {

    text = text.toLowerCase();
    query = query.toLowerCase();

    // direct match first
    if (text.includes(query)) return true;

    // simple fuzzy logic
    let qi = 0;

    for (let i = 0; i < text.length; i++) {

        if (text[i] === query[qi]) {
            qi++;
        }

        if (qi === query.length) {
            return true;
        }
    }

    return false;
}
function normalizeISBN(isbn) {

    return (isbn || "")
        .replace(/-/g, "")
        .replace(/\s/g, "")
        .toLowerCase();
}
function normalizeBook(volume) {

    return {
        title: volume.title || "",
        author: volume.authors?.[0] || "",
        genre: volume.categories?.[0] || "",
        isbn: volume.industryIdentifiers?.[0]?.identifier || "",
        cover: upgradeUrl(volume.imageLinks?.thumbnail || ""),

        series: "",
        shelves: [],

        tags: [],
        subjects: [],
        source: "google",

        rating: null,
        status: "Unread",
        notes: "",
        reading_history: [],
        date_added: Date.now()
    };
}

async function enrichBook(book) {

    const enriched = { ...book };

    // ========================
    // OPEN LIBRARY ENRICHMENT
    // ========================

    try {

        const response = await fetch(
            `https://openlibrary.org/search.json?q=${encodeURIComponent(book.title)}`
        );

        const data = await response.json();

        const first = data.docs?.[0];

        if (first) {

            enriched.cover =
                enriched.cover ||
                `https://covers.openlibrary.org/b/id/${first.cover_i}-M.jpg`;

            enriched.subjects =
                first.subject || [];
        }

    } catch (err) {

        console.log("OpenLibrary enrichment failed:", err);
    }

    // ========================
    // LIBRARY OF CONGRESS TAGS


    //try {

    //const response = await fetch(
    //  `https://www.loc.gov/books/?fo=json&q=${encodeURIComponent(book.title)}`
    //);

    //const data = await response.json();

    //const locBook = data.results?.[0];

    //if (locBook?.subject) {

    //  enriched.tags = [
    //    ...(enriched.tags || []),
    //  ...locBook.subject
    //];
    //}

    //} catch (err) {

    //  console.log("LOC enrichment failed:", err);
    //}

    //return enriched;
    //}

    //async function enrichAll(books) {

    //  const enrichedBooks =
    //    await Promise.all(
    //      books.map(enrichBook)
    //);

    //displayGoogleResults(enrichedBooks);
}

async function getBestCover(isbn, title, author) {

    // ========================
    // OPEN LIBRARY (BEST OPTION)
    // ========================

    if (isbn) {

        const openLibraryCover =
            `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

        try {

            const test = await fetch(openLibraryCover);

            if (test.ok) {
                return openLibraryCover;
            }

        } catch (err) {

            console.log("OpenLibrary cover failed:", err);
        }
    }


    // ========================
    // NO COVER FOUND
    // ========================

    return "";
}
// ========================
// STATS SECTION
// ========================

function getLibraryStats() {

    const stats = {
        total: myLibrary.length,
        finished: 0,
        reading: 0,
        unread: 0,

        genres: {},
        authors: {},
        ratings: {
            1: 0, 2: 0, 3: 0, 4: 0, 5: 0
        },

        monthlyAdds: Array(12).fill(0)
    };

    myLibrary.forEach(book => {

        // STATUS
        if (book.status === "Finished") stats.finished++;
        else if (book.status === "Reading") stats.reading++;
        else stats.unread++;

        // GENRES
        const genre = book.genre || "Unknown";
        stats.genres[genre] =
            (stats.genres[genre] || 0) + 1;

        // AUTHORS
        const author = book.author || "Unknown";
        stats.authors[author] =
            (stats.authors[author] || 0) + 1;

        // RATINGS
        const r = Number(book.rating);
        if (r >= 1 && r <= 5) {
            stats.ratings[r]++;
        }

        // MONTHLY ADDS
        const d = new Date(book.date_added);
        if (!isNaN(d)) {
            stats.monthlyAdds[d.getMonth()]++;
        }
    });

    return stats;
}

// ========================
// READING LOG STATS
// ========================

function getCurrentStreak() {
    return calculateStreak(true);
}

function getLongestStreak() {
    return calculateStreak(false);
}

function calculateStreak(currentOnly = true) {

    if (!readingLog.length) return 0;

    const loggedDays = new Set(
        readingLog
            .filter(log => log.books?.length)
            .map(log => log.date)
    );

    if (currentOnly) {

        let streak = 0;

        let current = new Date();

        const today =
            current.toISOString().slice(0, 10);

        // If today hasn't been logged yet,
        // start from yesterday.
        if (!loggedDays.has(today)) {
            current.setDate(current.getDate() - 1);
        }

        while (true) {

            const dateStr =
                current.toISOString().slice(0, 10);

            if (!loggedDays.has(dateStr)) {
                break;
            }

            streak++;

            current.setDate(
                current.getDate() - 1
            );
        }

        return streak;
    }

    // Longest streak
    const dates = [...loggedDays]
        .sort();

    let longest = 0;
    let currentStreak = 1;

    for (let i = 1; i < dates.length; i++) {

        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);

        const diff =
            (curr - prev) /
            (1000 * 60 * 60 * 24);

        if (diff === 1) {
            currentStreak++;
        } else {
            longest = Math.max(
                longest,
                currentStreak
            );
            currentStreak = 1;
        }
    }

    return Math.max(
        longest,
        currentStreak
    );
}

function getDaysReadThisYear() {
    const year = new Date().getFullYear();

    return readingLog.filter(log =>
        new Date(log.date).getFullYear() === year
    ).length;
}

function getMonthlyReadingCounts() {

    const counts = Array(12).fill(0);

    readingLog.forEach(log => {
        const month = new Date(log.date).getMonth();
        counts[month] += log.books?.length || 0;
    });

    return counts;
}

// ========================
// READING LOG
// ========================
function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

// 3 Render Functions
function renderStats() {

    const stats = getLibraryStats();

    const topGenre = Object.entries(stats.genres)
        .sort((a, b) => b[1] - a[1])[0];

    const topGenreLabel = topGenre ? topGenre[0] : "No genres";
    const topGenreCount = topGenre ? topGenre[1] : 0;

    document.getElementById("statsPanel").innerHTML = `
        <div class="stat-card" onclick="openGenreModal()">
    <h3>${topGenreLabel}</h3>
    <p>${topGenreCount} books</p>
</div>

        <div class="stat-card" onclick="openAuthorModal()">
            <h3>${Object.keys(stats.authors).length}</h3>
            <p>Authors</p>
        </div>

        <div class="stat-card" onclick="openRatingModal()">
            <h3>${stats.finished}</h3>
            <p>Ratings</p>
        </div>

        <div class="stat-card" onclick="openReadingDashboard()">
    <h3>${stats.reading}</h3>
    <p>Reading</p>
</div>
    `;
}
function renderBookGrid(books, showActions = false, actionType = "") {

    return `
        <div class="mini-library-grid">
            ${books.map(book => `
                <div class="mini-book-card">

                    <img src="${book.cover || ""}">
                    <p>${book.title}</p>
                    <small>${book.author || ""}</small>

                    ${showActions ? `
                        <button onclick="${actionType}('${book.id}'')">
                            Mark as Finished
                        </button>
                    ` : ""}

                </div>
            `).join("")}
        </div>
    `;
}



function renderHabitModal() {

    const content =
        document.getElementById("habitModalContent");

    const currentStreak =
        getCurrentStreak();

    const longestStreak =
        getLongestStreak();

    const daysRead =
        getDaysReadThisYear();

    const monthLabels = [
        "Jan", "Feb", "Mar", "Apr",
        "May", "Jun", "Jul", "Aug",
        "Sep", "Oct", "Nov", "Dec"
    ];

    const monthly = getMonthlyReadingCounts();

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    const selectedDate =
        window.currentReadingLogDate || today;

    const todayLog =
        readingLog.find(log =>
            log.date === selectedDate
        );

    const todayBooks =
        todayLog?.books
            ?.map(id => findBook(id))
            .filter(Boolean) || [];

    const currentlyReadingBooks =
        myLibrary.filter(book =>
            book.status === "Reading"
        );

    content.innerHTML = `

        <div class="habit-stats-grid">

            <div class="habit-card">
                <h3>🔥 ${currentStreak}</h3>
                <p>Current Streak</p>
            </div>

            <div class="habit-card">
                <h3>🏆 ${longestStreak}</h3>
                <p>Longest Streak</p>
            </div>

            <div class="habit-card">
                <h3>📚 ${daysRead}</h3>
                <p>Days Read This Year</p>
            </div>

        </div>

       <div class="habit-actions">

    ${currentlyReadingBooks.length
            ? `

        <div class="reading-cover-grid">

            ${currentlyReadingBooks.map(book => `

                <label class="reading-cover-card">

                    <input
    type="checkbox"
    value="${book.id}"
    ${todayLog?.books?.includes(String(book.id))
                    ? "checked"
                    : ""
                }
>

                    <img
                        src="${book.cover || ""}"
                        alt="${book.title}"
                    >

                    <p>${book.title}</p>

                </label>

            `).join("")}

        </div>

        <button id="logTodayBtn">
            Log Today's Reading
        </button>

        `
            : `

        <p class="empty-state">
            No books are marked as Currently Reading.
        </p>

        `
        }

</div>

        <div class="today-books-section">

    <div class="reading-log-header">

    <h3>Reading Log</h3>

    <input
        type="date"
        id="readingLogDate"
        value="${selectedDate}"
    >

</div>

    ${todayBooks.length

            ? `

        <div class="today-books-grid">

            ${todayBooks.map(book => `

                <div class="today-book-card">

                    <img
                        src="${book.cover || ""}"
                        alt="${book.title}"
                    >

                    <p>${book.title}</p>

                </div>

            `).join("")}

        </div>

        `

            : `

        <p class="empty-state">
            No books logged today.
        </p>

        `
        }

</div>
</div>

        <div class="monthly-chart">

            ${monthly.map((count, i) => `

                <div class="month-bar-wrapper">

                    <div
                        class="month-bar"
                        style="
                            height:${count * 8 + 10}px
                        "
                    ></div>

                    <span>${monthLabels[i]}</span>

                </div>

            `).join("")}

        </div>
    `;

    setTimeout(() => {

        const dateInput =
            document.getElementById("readingLogDate");

        if (dateInput) {

            dateInput.addEventListener("change", e => {

                window.currentReadingLogDate = e.target.value;

                renderHabitModal();
            });
        }

        const btn =
            document.getElementById("logTodayBtn");

        if (!btn) return;

        btn.addEventListener("click", () => {

            const selected = [
                ...document.querySelectorAll(
                    ".reading-cover-card input:checked"
                )
            ].map(cb => String(cb.value))

            logReadingDay(
                window.currentReadingLogDate || today,
                selected
            );

            renderHabitModal();
        });

    }, 0);
}

function renderReadingHistory(book) {

    const container =
        document.getElementById("readingHistoryContainer");

    container.innerHTML = "";

    const history = book.readingHistory || [];

    history.forEach((session, index) => {

        const div = document.createElement("div");

        div.classList.add("reading-session");

        div.innerHTML = `

            <label>Start Date</label>

            <input
                type="date"
                class="reading-start"
                data-index="${index}"
                value="${session.startDate || ""}"
            >

            <label>Finish Date</label>

            <input
                type="date"
                class="reading-finish"
                data-index="${index}"
                value="${session.endDate || ""}"
            >

            <div class="reading-session-actions">

    <button
        class="save-session-btn"
        data-index="${index}"
    >
        Save Session
    </button>

    <button
        class="remove-session-btn"
        data-index="${index}"
    >
        Remove
    </button>

</div>
        `;

        container.appendChild(div);
    });

    // REMOVE SESSION
    container.querySelectorAll(".remove-session-btn")
        .forEach(btn => {

            btn.addEventListener("click", e => {

                const index =
                    Number(e.target.dataset.index);

                book.readingHistory.splice(index, 1);

                renderReadingHistory(book);
            });
        });

    /* SAVE SESSION */

    container.querySelectorAll(".save-session-btn")
        .forEach(btn => {

            btn.addEventListener("click", e => {

                const index =
                    Number(e.target.dataset.index);

                const session =
                    container.querySelectorAll(".reading-session")[index];

                const startDate =
                    session.querySelector(".reading-start").value;

                const finishDate =
                    session.querySelector(".reading-finish").value;

                book.readingHistory[index] = {
                    startDate,
                    endDate: finishDate
                };

                saveLibrary();

                // refresh visible reading history
                document.getElementById("detailReadingHistory").innerHTML =
                    book.readingHistory.length
                        ? book.readingHistory.map((r, i) => `
            <p>
                Reading ${i + 1}:
                ${r.startDate || "?"}
                →
                ${r.endDate || "?"}
            </p>
        `).join("")
                        : "<p>No reading history</p>";

                saveLibrary();

            });

        });
}
function renderLibrary() {

    library.innerHTML = "";

    // USE FILTER PIPELINE
    let books = getFilteredBooks();

    // SHELF FILTER
    if (activeShelf !== "All") {
        books = books.filter(book =>
            (book.shelves || []).includes(activeShelf)
        );
    }

    books.forEach(book => {

        const shelfDots = (book.shelves || [])
            .map(name => {
                const shelf = shelves.find(s => s.name === name);

                return `
            <span class="shelf-dot"
                  style="background:${shelf?.color || "#999"}"
                  title="${name}">
            </span>
        `;
            })
            .join("");


        const card = document.createElement("div");

        card.classList.add("book-card");

        card.innerHTML = `
    <div class="book-shelf-dots">
        ${renderShelfDots(book)}
    </div>

    ${book.cover ? `<img src="${book.cover}">` : ""}

    <h3>${book.title}</h3>
    <p>${book.author}</p>

    <p class="book-tags">
        ${(book.tags || []).join(" • ")}
    </p>

    <button onclick="openBookModal('${book.id}')">
        Details
    </button>
`;

        library.appendChild(card);
    });

    // update shelf label count
    updateShelfLabel(books.length);
}
function renderShelfCheckboxes(book) {

    const container = document.getElementById("shelfCheckboxes");
    if (!container) return;

    container.innerHTML = "";

    shelves.forEach(shelf => {

        const checked =
            (book.shelves || []).includes(shelf.name);

        const wrapper = document.createElement("div");

        wrapper.innerHTML = `
            <label>
                <input type="checkbox"
                       value="${shelf.name}"
                       ${checked ? "checked" : ""}>
                ${shelf.name}
            </label>
        `;

        container.appendChild(wrapper);
    });
}
function renderManualShelfCheckboxes() {

    const container =
        document.getElementById("manualShelfCheckboxes");

    container.innerHTML = "";

    shelves.forEach(shelf => {

        const div = document.createElement("div");

        div.innerHTML = `
            <label>
                <input type="checkbox"
                       value="${shelf.name}">
                ${shelf.name}
            </label>
        `;

        container.appendChild(div);
    });
}
function displayGoogleResults(books) {
    
    searchResults.innerHTML = "";
    books.forEach(bookData => {
        const cover = bookData.cover || "";

        const bookInfo = document.createElement("div");

        bookInfo.classList.add("book-info");

        bookInfo.innerHTML = `

            ${cover ? `<img src="${cover}" class="search-cover">` : ""}

            <h3>${bookData.title}</h3>

            <p>${bookData.author}</p>

            <p>${bookData.genre}</p>

            ${Array.isArray(bookData.tags) && bookData.tags.length ? `
            ${bookData.tags?.length
                    ? `<small>${bookData.tags.slice(0, 3).join(", ")}</small>`
                    : ""
                }
            `
                : ""
            }                
<select class="search-shelf-select">
    <option value="">No Shelf</option>

    ${shelves.map(shelf => `
        <option value="${shelf.name}">
            ${shelf.name}
        </option>
    `).join("")}
</select>

<button class="add-book-btn">
    Add to Library
</button>`;

        const addBtn =
            bookInfo.querySelector(".add-book-btn");

        addBtn.addEventListener("click", () => {

            const selectedShelf =
                bookInfo.querySelector(".search-shelf-select").value;

            addToLibrary(bookData, selectedShelf);

            searchResults.innerHTML = "";
            
            searchInput.value = "";
        });

        searchResults.appendChild(bookInfo);
    });
}

function statCard(type, action, value, label) {
    return `
        <div class="stat-card"
             data-type="${type}"
             data-action="${action}">
            <h3>${value}</h3>
            <p>${label}</p>
        </div>
    `;
}


function getBooksThisMonth() {

    const now = new Date();

    return myLibrary.filter(book => {

        const added = new Date(book.dateAdded);

        return (
            added.getMonth() === now.getMonth() &&
            added.getFullYear() === now.getFullYear()
        );
    }).length;
}

function getAverageRating() {

    const rated = myLibrary.filter(b => b.rating);

    if (!rated.length) return "N/A";

    const avg =
        rated.reduce((sum, b) => sum + Number(b.rating), 0)
        / rated.length;

    return avg.toFixed(1);
}

function getTopGenre() {

    const counts = countBy(myLibrary, "genre");

    return getMaxKey(counts, "None");
}

function getTopAuthor() {

    const counts = countBy(myLibrary, "author");

    return getMaxKey(counts, "None");
}

function getCompletionRate() {

    const total = myLibrary.length;

    const finished =
        myLibrary.filter(b => b.status === "Finished").length;

    return total ? Math.round((finished / total) * 100) : 0;
}

function countBy(arr, key) {

    if (!Array.isArray(arr)) {
        console.error("countBy expected array but got:", arr);
        return {};
    }

    return arr.reduce((acc, item) => {

        const val = item?.[key] || "Unknown";

        acc[val] = (acc[val] || 0) + 1;

        return acc;

    }, {});
}
function getMaxKey(obj, fallback = "None") {

    const keys = Object.keys(obj);

    if (!keys.length) return fallback;

    return keys.reduce((a, b) =>
        obj[a] > obj[b] ? a : b
    );
}

function countBy(arr, key) {

    return arr.reduce((acc, item) => {

        const val = item[key] || "Unknown";

        acc[val] = (acc[val] || 0) + 1;

        return acc;

    }, {});
}

function getMaxKey(obj, fallback = "None") {

    const keys = Object.keys(obj);

    if (!keys.length) return fallback;

    return keys.reduce((a, b) =>
        obj[a] > obj[b] ? a : b
    );
}
// ========================
// SHELF NAVIGATION
// ========================

function renderShelfNav() {

    const shelfNav = document.getElementById("shelfNav");
    shelfNav.innerHTML = "";

    shelfNav.appendChild(
        createShelfItem("All Books", "All", false, null)
    );

    shelves.forEach(shelf => {
        shelfNav.appendChild(
            createShelfItem(
                shelf.name,
                shelf.name,
                true,
                shelf
            )
        );
    });
}
function createShelfItem(label, shelfValue, isEditable, shelfObj) {

    const wrapper = document.createElement("div");
    wrapper.classList.add("shelf-item");

    const colorDot = shelfObj?.color
        ? `<span class="shelf-dot" style="background:${shelfObj.color}"></span>`
        : "";

    wrapper.innerHTML = `
        <button class="shelf-button shelf-main-button">
            ${colorDot}
            <span class="shelf-name">${label}</span>
        </button>

        ${isEditable ? `
            <button class="shelf-edit-btn">Edit</button>
        ` : ""}
    `;

    wrapper.querySelector(".shelf-main-button").onclick = () => {

        activeShelf = shelfValue;

        const filtered = activeShelf === "All Books"
            ? myLibrary
            : myLibrary.filter(b =>
                (b.shelves || []).includes(activeShelf)
            );

        updateShelfLabel(filtered.length);
        renderLibrary(filtered);
        renderStats();
    };

    if (isEditable) {
        wrapper.querySelector(".shelf-edit-btn").onclick = (e) => {
            e.stopPropagation();
            openShelfEditModal(shelfObj);
        };
    }

    return wrapper;
}
function highlightActiveShelf() {

    document.querySelectorAll(".shelf-main-button")
        .forEach(btn => {

            const isActive =
                btn.dataset.shelf === activeShelf;

            btn.classList.toggle("active", isActive);
        });
}
function updateShelfLabel(count) {

    const label = document.getElementById("activeShelfLabel");
    if (!label) return;

    label.textContent =
        activeShelf === "All"
            ? `All Books (${myLibrary.length})`
            : `${activeShelf} (${count})`;
}

// ========================
// MODALS
// ========================
function openLibraryModal() {
    openModalView("📚 Library", `
        <div class="mini-library-grid">
            ${myLibrary.map(book => `
                <div class="mini-book-card">
                    <img src="${book.cover || ""}">
                    <p>${book.title}</p>
                    <small>${book.author || ""}</small>
                </div>
            `).join("")}
        </div>
    `);
}

function openModal(modalId, title, html) {

    const wrapper = document.getElementById(modalId);
    const content = wrapper?.querySelector(".modal-content");

    if (!wrapper || !content) {
        console.error("Modal missing:", modalId);
        return;
    }

    content.innerHTML = `
        <div class="modal-header">
            <h2>${title || ""}</h2>
        </div>
        ${html || ""}
    `;

    wrapper.style.display = "flex";
}

function openStatsModal(title, html) {

    const body = document.querySelector("#statsModal .modal-body");

    if (!body) return;

    body.innerHTML = `
        <h2 class="section-title">${title}</h2>
        ${html}
    `;

    document.getElementById("statsModal").style.display = "flex";
}

function openBookModalView(title, html) {
    openModal("bookModal", title, html);
}

function progressBarRow(label, value, max) {

    return `

        <div class="stat-row">

            <span>${label}</span>

            <div class="bar-bg">

                <div class="bar-fill"
                     style="
                        width:${percent(value, max)}%
                     ">
                </div>

            </div>

            <span>${value}</span>

        </div>

    `;
}

function openBookModal(id) {

    const book = myLibrary.find(b => String(b.id) === String(id));

    currentEditId = id;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const setSrc = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.src = value || "";
    };

    setSrc("detailCover", book.cover);
    setText("detailTitle", book.title);
    setText("detailAuthor", book.author);
    setText("detailSeries", book.series || "");
    setText("detailGenre", book.genre || "");
    setText("detailStatus", book.status);
    setText("detailRating", book.rating ? `${book.rating}/5` : "Unrated");
    setText("detailISBN", book.isbn || "");
    setText("detailShelves", (book.shelves || []).join(", ") || "None");

    const history = book.readingHistory || [];

    setText(
        "detailReadingHistory",
        history.length
            ? history.map((r, i) =>
                `Reading ${i + 1}: ${r.startDate} → ${r.endDate}`
            ).join("<br>")
            : "No reading history"
    );

    setText("detailNotes", book.notes || "No notes added.");

    document.getElementById("editSection").style.display = "none";
    document.getElementById("bookModal").style.display = "flex";
}

function openGenreModal() {

    const stats = getLibraryStats();

    const sorted = Object.entries(stats.genres || {})
        .sort((a, b) => b[1] - a[1]);

    openStatsModal("📖 Genre Dashboard", `

        <div class="genre-grid">

            ${sorted.map(([genre, count]) => {

        const percentValue = Math.round((count / stats.total) * 100);

        return `
                    <div class="genre-card">

                        <div class="genre-header">
                            <h3>${genre}</h3>
                            <span>${count}</span>
                        </div>

                        <div class="genre-bar">
                            <div class="genre-fill" style="width:${percentValue}%"></div>
                        </div>

                        <p>${percentValue}% of library</p>

                    </div>
                `;
    }).join("")}

        </div>
    `);
}

function openAuthorModal() {

    const stats = getLibraryStats();

    const sorted = Object.entries(stats.authors)
        .sort((a, b) => b[1] - a[1]);

    openStatsModal("👤 Author Breakdown", `
        <div class="stat-list">
            ${sorted.map(([author, count]) => `
                <div class="stat-row">
                    <span>${author}</span>
                    <div class="bar-bg">
                        <div class="bar-fill"
                             style="width:${(count / stats.total) * 100}%"></div>
                    </div>
                    <span>${count}</span>
                </div>
            `).join("")}
        </div>
    `);
}

function openRatingModal() {

    const stats = getLibraryStats();

    const counts = stats.ratings;

    openStatsModal("⭐ Rating Distribution", `
        <div class="stat-list">
            ${[5, 4, 3, 2, 1].map(star => `
                <div class="stat-row">
                    <span>${star} ★</span>
                    <div class="bar-bg">
                        <div class="bar-fill"
                             style="width:${(counts[star] / stats.total) * 100 || 0}%"></div>
                    </div>
                    <span>${counts[star] || 0}</span>
                </div>
            `).join("")}
        </div>
    `);
}

function openReadingDashboard() {

    const currentStreak = getCurrentStreak();
    const longestStreak = getLongestStreak();
    const yearlyDays = getDaysReadThisYear();

    openStatsModal("🔥 Reading Dashboard", `

        <div class="habit-stats-grid">

            <div class="habit-card">
                <h3>${currentStreak}</h3>
                <p>Current Streak</p>
            </div>

            <div class="habit-card">
                <h3>${longestStreak}</h3>
                <p>Longest Streak</p>
            </div>

            <div class="habit-card">
                <h3>${yearlyDays}</h3>
                <p>Days Read This Year</p>
            </div>

        </div>

    `);
}
function openReadingLogDashboard() {

    const today =
        new Date().toISOString().slice(0, 10);

    const latestDate =
        readingLog.length
            ? readingLog.map(l => l.date).sort().at(-1)
            : today;

    const todayEntry =
        readingLog.find(
            l => l.date === latestDate
        ) || { books: [] };

    const currentStreak = getCurrentStreak();

    openStatsModal("📖 Reading Dashboard", `

        <div class="habit-stats-grid">

            <div class="habit-card">
                <h3>${currentStreak}</h3>
                <p>Current Streak</p>
            </div>

            <div class="habit-card">
                <h3>${todayEntry.books.length}</h3>
                <p>Books Logged Today</p>
            </div>

            <div class="habit-card">
                <h3>${readingLog.length}</h3>
                <p>Total Logged Days</p>
            </div>

        </div>

        <div class="calendar-section">

            <h3>Reading Activity</h3>

            <div id="readingCalendar"></div>

        </div>

        <div class="log-section">

    <label>
        Select Date:
        <input type="date"
               id="logDate"
               value="${today}">
    </label>

    <div id="logEditor"></div>

    <button id="saveReadingLogBtn"
            class="reading-dashboard-btn">
        💾 Save Reading Log
    </button>

</div>

    `);

    requestAnimationFrame(() => {

        renderReadingCalendar();

        setupLogDashboard(today);

    });
}
function setupLogDashboard(initialDate) {

    const dateInput =
        document.getElementById("logDate");

    const saveBtn =
        document.getElementById("saveReadingLogBtn");

    if (!dateInput) return;

    renderLogEditor(initialDate);

    dateInput.addEventListener("change", (e) => {
        renderLogEditor(e.target.value);
    });

    if (saveBtn) {

        saveBtn.addEventListener("click", async () => {

            const date = dateInput.value;

            const selected = Array.from(
                document.querySelectorAll(
                    "#logEditor input[type='checkbox']:checked"
                )
            ).map(cb => String(cb.value));

            await logReadingDay(date, selected);

            renderReadingCalendar();

            alert("Reading log saved!");
        });
    }
}

async function logReadingDay(date, selectedBookIds = []) {
    console.log("LOADING READING LOG...");
    console.log("LOG READING DAY FIRED");
    console.log("logReadingDay called", date, selectedBookIds);

    const { data, error } = await supabaseClient
        .from("reading_log")
        .upsert(
            {
                date,
                books: selectedBookIds
            },
            {
                onConflict: "date",
                ignoreDuplicates: false
            }
        )
        .select();

    console.log("SUPABASE RESULT:", { data, error });

    if (error) {
        console.error("Reading log save error:", error);
        return;
    }

    let entry = readingLog.find(d => d.date === date);

    if (!entry) {
        entry = {
            date,
            books: []
        };
        readingLog.push(entry);
    }

    entry.books = [...selectedBookIds];

    console.log("Reading log saved.");
    console.log("READING LOG DATA:", data);
}


function renderReadingCalendar() {

    const container =
        document.getElementById("readingCalendar");

    if (!container) return;

    
const month = window.calendarMonth;
const year = window.calendarYear;

    const firstDay =
        new Date(year, month, 1);

    const lastDay =
        new Date(year, month + 1, 0);

    const monthName =
        firstDay.toLocaleString("default", {
            month: "long"
        });

    let html = `
    <div class="calendar-month">

        <div class="calendar-header">

            <button
                class="calendar-nav-btn"
                onclick="changeMonth(-1)">
                ◀
            </button>

            <span>
                ${monthName} ${year}
            </span>

            <button
                class="calendar-nav-btn"
                onclick="changeMonth(1)">
                ▶
            </button>

        </div>

        <div class="calendar-grid">
`;

        for (
        let i = 0;
        i < firstDay.getDay();
        i++
    ) {
        html += `<div></div>`;
    }

        for (
        let day = 1;
        day <= lastDay.getDate();
        day++
    ) {

        const dateObj =
            new Date(year, month, day);

        const dateStr =
            dateObj.toISOString().slice(0, 10);

        const log =
            readingLog.find(
                l => l.date === dateStr
            );

        const books =
            log?.books || [];

        const covers = books
            .map(id => findBook(id))
            .filter(Boolean)
            .slice(0, 3);

        html += `
            <div
                class="calendar-date ${books.length ? "has-reading" : ""}"
                onclick="openLogByDate('${dateStr}')"
            >

                <div class="calendar-number">
                    ${day}
                </div>

                <div class="calendar-books">

    ${covers.length
        ? covers.map(book => `
            <img
                src="${book.cover || ""}"
                class="calendar-cover"
                alt="${book.title}"
            >
        `).join("")
        : books.length
            ? `<span class="calendar-dot"></span>`
            : ""
    }

</div>

            </div>
        `;
    }

        html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function changeMonth(direction) {

    window.calendarMonth += direction;

    if (window.calendarMonth < 0) {
        window.calendarMonth = 11;
        window.calendarYear--;
    }

    if (window.calendarMonth > 11) {
        window.calendarMonth = 0;
        window.calendarYear++;
    }

    renderReadingCalendar();
}

function openLogByDate(date) {
    document.getElementById("logDate").value = date;
    renderLogEditor(date);
}
function getStreakFromLogs() {

    const dates = readingLog
        .map(l => l.date)
        .sort()
        .reverse();

    let streak = 0;
    let current = new Date();

    for (let i = 0; i < 365; i++) {

        const dateStr = current.toISOString().slice(0, 10);

        if (dates.includes(dateStr)) {
            streak++;
        } else {
            break;
        }

        current.setDate(current.getDate() - 1);
    }

    return streak;
}
function setupLogSearch(date) {

    const input = document.getElementById("logSearch");
    const results = document.getElementById("logSearchResults");

    if (!input || !results) return;

    input.addEventListener("input", (e) => {

        const q = e.target.value.toLowerCase().trim();

        if (!q) {
            results.innerHTML = "";
            return;
        }

        const matches = myLibrary.filter(b =>
            (b.title || "").toLowerCase().includes(q) ||
            (b.author || "").toLowerCase().includes(q)
        ).slice(0, 8);

        results.innerHTML = matches.map(book => `
            <div class="search-book-card"
                 onclick="toggleLogBook('${book.id}', '${date}')">
                <p>${book.title}</p>
                <small>${book.author}</small>
            </div>
        `).join("");
    });
}
function toggleLogBook(bookId, date) {

    let entry =
        readingLog.find(l => l.date === date);

    if (!entry) {
        entry = { date, books: [] };
        readingLog.push(entry);
    }

    if (!entry.books.includes(bookId)) {
        entry.books.push(bookId);
    } else {
        entry.books = entry.books.filter(id => id !== bookId);
    }

    renderLogEditor(date); // instant refresh
}

function setupReadingLogSave() {

    const btn = document.getElementById("saveReadingLogBtn");

    if (!btn) return;

    btn.addEventListener("click", () => {

        const date = document.getElementById("logDate").value;

        const selected = Array.from(
            document.querySelectorAll("#readingLogList input:checked")
        ).map(cb => String(cb.value))

        let entry = readingLog.find(l => l.date === date);

        if (!entry) {
            entry = { date, books: [] };
            readingLog.push(entry);
        }

        entry.books = selected;

        saveLibrary();

        alert("Reading log saved!");
    });
}
function renderLogEditor(date) {

    const editor = document.getElementById("logEditor");
    if (!editor) return;

    const entry =
        readingLog.find(l => l.date === date) || { books: [] };

    const readingBooks =
        myLibrary.filter(b => b.status === "Reading");

    editor.innerHTML = `
        <h3>Log Books for ${date}</h3>

        <div class="log-columns">

            <!-- CURRENTLY READING -->
            <div>
                <h4>Currently Reading</h4>

                ${readingBooks.length ? readingBooks.map(book => `
                    <label class="reading-log-item">
                        <input type="checkbox"
                               value="${book.id}"
                              ${entry.books.includes(String(book.id)) ? "checked" : ""}>
                        ${book.title}
                    </label>
                `).join("") : `<p>No currently reading books</p>`}
            </div>

            <!-- SEARCH ADD -->
            <div>
                <h4>Add from Library</h4>

                <input type="text"
                       id="logSearch"
                       placeholder="Search books...">

                <div id="logSearchResults"></div>
            </div>

        </div>
    `;

    setupLogSearch(date);
}
function openModalView(title, html) {

    const modal =
        document.getElementById("habitModal");

    const content =
        document.querySelector("#habitModal .modal-body");

    if (!modal || !content) {
        console.error("Habit modal missing");
        return;
    }

    content.innerHTML = `
        <h2 class="section-title">${title}</h2>
        ${html}
    `;

    modal.classList.remove("hidden");
}

function openCurrentlyReadingModal() {

    const readingBooks =
        myLibrary.filter(b => b.status === "Reading");

    openModalView("📘 Currently Reading", `

        <div class="currently-reading-toolbar">

            <input
                type="text"
                id="currentSearch"
                placeholder="Search books to add..."
            >

            <div id="searchResults"
                 class="search-results-grid">
            </div>

        </div>

        ${readingBooks.length
            ? renderBookGrid(
                readingBooks,
                true,
                "markFinished"
            )
            : `
                <p class="empty-state">
                    No books currently being read.
                </p>
            `
        }

    `);

    setupCurrentlyReadingSearch();
}

function setupCurrentlyReadingSearch() {

    const searchInput =
        document.getElementById("currentSearch");

    const resultsContainer =
        document.getElementById("searchResults");

    if (!searchInput || !resultsContainer) return;

    searchInput.addEventListener("input", (e) => {

        const query =
            e.target.value.toLowerCase().trim();

        // clear results if empty
        if (!query) {
            resultsContainer.innerHTML = "";
            return;
        }

        const normalizedISBNQuery =
            normalizeISBN(query);

        const matches = myLibrary.filter(book =>

            book.status !== "Reading" && (

                fuzzyMatch(
                    book.title,
                    query
                ) ||

                fuzzyMatch(
                    book.author,
                    query
                ) ||

                normalizeISBN(book.isbn)
                    .includes(normalizedISBNQuery)
            )
        );

        resultsContainer.innerHTML =
            matches.map(book => `

                <div class="search-book-card"
                     data-id="'${book.id}'">

                    <img src="${book.cover || ""}">

                    <p>${book.title || "Untitled"}</p>

                    <small>${book.author || "Unknown Author"}</small>

                </div>

            `).join("");

        resultsContainer
            .querySelectorAll(".search-book-card")
            .forEach(card => {

                card.addEventListener("click", () => {

                    const book = myLibrary.find(
                        b => b.id == card.dataset.id
                    );

                    if (book) {

                        book.status = "Reading";

                        saveLibrary();

                        openCurrentlyReadingModal();
                    }
                });
            });
    });

    // initial empty state
    resultsContainer.innerHTML = "";
}
window.openCurrentlyReadingDashboard = function () {

    const reading = myLibrary.filter(b => b.status === "Reading");
    const finished = myLibrary.filter(b => b.status === "Finished");
    const unread = myLibrary.filter(b => b.status === "Unread");

    const total = myLibrary.length;
    const percent = total ? Math.round((finished.length / total) * 100) : 0;

    openStatsModal("📚 Currently Reading Dashboard", `
        <div class="stat-list">

            <div class="stat-row">
                <span>Currently Reading</span>
                <span>${reading.length}</span>
            </div>

            <div class="stat-row">
                <span>Finished</span>
                <span>${finished.length}</span>
            </div>

            <div class="stat-row">
                <span>Unread</span>
                <span>${unread.length}</span>
            </div>

            <div class="stat-row">
                <span>Completion Rate</span>
                <span>${percent}%</span>
            </div>

        </div>
    `);
};

window.openShelfEditModal = function (shelf) {
    console.log("OPEN MODAL FIRED", shelf);
    editingShelf = shelf;

    document.getElementById("editShelfName").value = shelf.name;
    renderColorPicker(shelf.color);

    document.getElementById("shelfEditModal")
        .classList.remove("hidden");
};

// ========================
// 6 ACTION FUNCTIONS
// ========================

// ------------------------
// SHELF MANAGEMENT
// ------------------------

async function addShelf() {

    const input = document.getElementById("newShelfInput");
    const colorInput = document.getElementById("newShelfColor");

    const shelfName = input.value.trim().replace(/\s+/g, " ");
    const shelfColor = colorInput?.value || "#999";

    if (!shelfName) return;

    // prevent duplicates (local check still fine)
    if (shelves.some(s => s.name === shelfName)) return;

    shelves.push({
        name: shelfName,
        color: shelfColor
    });

    input.value = "";

    const { error } = await supabaseClient
        .from("shelves")
        .insert({
            name: shelfName,
            color: shelfColor
        });

    if (error) {
        console.error("Shelf insert failed:", error);
    }
}

let editingShelf = null;

function getPrimaryShelfColor(book) {

    const firstShelf = book.shelves?.[0];

    const shelfObj = shelves.find(s => s.name === firstShelf);

    return shelfObj?.color || "#999";
}
function renderShelfDots(book) {

    const dots = (book.shelves || [])
        .map(name => {

            const shelf = shelves.find(s => s.name === name);

            return `
                <span class="shelf-dot"
                      title="${name}"
                      style="background:${shelf?.color || "#999"}">
                </span>
            `;
        })
        .join("");

    if (!dots) return "";

    const color = getPrimaryShelfColor(book);

    return `
        <div class="shelf-pill"
             style="border-color:${color}">
            ${dots}
        </div>
    `;
}

function renderColorPicker(selectedColor) {

    const container = document.getElementById("colorPicker");
    container.innerHTML = "";

    shelfColors.forEach(color => {

        const swatch = document.createElement("div");

        swatch.classList.add("color-swatch");
        swatch.style.background = color;

        if (color === selectedColor) {
            swatch.classList.add("active");
        }

        swatch.onclick = () => {

            document.querySelectorAll(".color-swatch")
                .forEach(s => s.classList.remove("active"));

            swatch.classList.add("active");

            container.dataset.selectedColor = color;
        };

        container.appendChild(swatch);
    });

    container.dataset.selectedColor = selectedColor;
}

// ------------------------
// LIBRARY CRUD
// ------------------------
async function searchBooks() {

    const input = searchInput.value.trim();

    // prevent tiny searches
    if (input.length < 2) {
        searchResults.innerHTML = "";
        return;
    }

    // prevent duplicate requests
    if (input === lastSearchQuery) return;

    lastSearchQuery = input;

    searchResults.innerHTML = "<p>Searching...</p>";

    // build query properly
    let query;

    if (/^\d{10}$/.test(input) || /^\d{13}$/.test(input)) {
        query = `isbn:${input}`;
    } else {
        query = `intitle:${input}`;
    }

    try {
        const response = await fetch(
            "https://bkjvdyvosoqyiorpkhvy.supabase.co/functions/v1/google-books-search",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ query })
            }
        );

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            searchResults.innerHTML = "<p>No books found.</p>";
            return;
        }

        const googleBooks = data.items.map(item =>
            normalizeBook(item.volumeInfo)
        );

        displayGoogleResults(googleBooks);

    } catch (err) {
        console.error("Search error:", err);
        searchResults.innerHTML = "<p>Error searching books.</p>";
    }
}async function removeBook(id) {

    const { error } = await supabaseClient
        .from("books")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Delete error:", error);
        return;
    }

    myLibrary = myLibrary.filter(b => b.id !== id);

    renderLibrary();
    renderStats();
}

function confirmRemoveBook(id) {
    if (!confirm("Remove this book from your library?")) return;
    removeBook(id);
}

async function addToLibrary(bookData, shelf = "") {

    const cover = await getBestCover(
        bookData.isbn,
        bookData.title,
        bookData.author
    );

    const book = {
        title: bookData.title,
        author: bookData.author,
        genre: bookData.genre,
        series: bookData.series,
        cover,
        isbn: bookData.isbn,

        shelves: shelf ? [shelf] : [],
        tags: [],
        reading_history: [],
        status: "Unread",
        rating: null,
        date_added: Date.now()
    };

    console.log("🚨 SAVING BOOK TO SUPABASE:", book);

    const { data, error } = await supabaseClient
        .from("books")
        .insert([book])
        .select();

    console.log("SUPABASE RESPONSE:", { data, error });

    if (error) {
        console.error("Insert error:", error);
        return;
    }

    await loadLibrary();
await loadReadingLog();
}

function findPossibleDuplicates(newBook) {

    const newTitle =
        (newBook.title || "")
            .toLowerCase()
            .trim();

    const newAuthor =
        (newBook.author || "")
            .toLowerCase()
            .trim();

    const newISBN =
        normalizeISBN(newBook.isbn);

    return myLibrary.filter(book => {

        const existingTitle =
            (book.title || "")
                .toLowerCase()
                .trim();

        const existingAuthor =
            (book.author || "")
                .toLowerCase()
                .trim();

        const existingISBN =
            normalizeISBN(book.isbn);

        // exact ISBN match
        if (
            newISBN &&
            existingISBN &&
            newISBN === existingISBN
        ) {
            return true;
        }

        // fuzzy title + author match
        const titleMatch =
            fuzzyMatch(existingTitle, newTitle) ||
            fuzzyMatch(newTitle, existingTitle);

        const authorMatch =
            fuzzyMatch(existingAuthor, newAuthor) ||
            fuzzyMatch(newAuthor, existingAuthor);

        return titleMatch && authorMatch;
    });
}

async function saveManualBook() {

    const selectedShelves = [
        ...document.querySelectorAll("#manualShelfCheckboxes input:checked")
    ].map(i => i.value);

    const newBook = {
        title: manualTitle.value.trim(),
        author: manualAuthor.value.trim(),
        isbn: manualISBN.value.trim(),
        genre: manualGenre.value.trim(),
        series: manualSeries.value.trim(),
        cover: manualCover.value.trim(),
        notes: manualNotes.value.trim(),

        shelves: selectedShelves,
        tags: document.getElementById("manualTags")
            .value
            .split(",")
            .map(t => t.trim())
            .filter(Boolean),

        reading_history: [],
        status: "Unread",
        rating: null,
        date_added: Date.now()
    };

    console.log("🚨 SAVING BOOK TO SUPABASE:", newBook);

const { data, error } = await supabaseClient
  .from("books")
  .insert([newBook])
  .select();

if (error) {
  console.error(error);
  return;
}

const insertedBook = data[0];

// IMPORTANT: update local state
myLibrary.unshift(insertedBook);

// THEN render
renderLibrary();
renderStats();
closeManualAddModal();
}

async function saveEditedBook() {

    const book = findBook(currentEditId);
    if (!book) return;

    const updatedBook = {
        cover: editCoverInput.value.trim() || book.cover,
        title: editTitle.value,
        author: editAuthor.value,
        series: editSeries.value,
        genre: editGenre.value,
        rating: editRating.value ? Number(editRating.value) : null,
        isbn: editISBN.value,
        status: editStatus.value,
        notes: editNotes.value,

        reading_history: Array.from(
            document.querySelectorAll(".reading-session")
        ).map(session => ({
            startDate: session.querySelector(".reading-start").value,
            endDate: session.querySelector(".reading-finish").value
        })),

        shelves: [
            ...document.querySelectorAll("#shelfCheckboxes input:checked")
        ].map(i => i.value),

        tags: document
            .getElementById("editTags")
            .value
            .split(",")
            .map(t => t.trim())
            .filter(Boolean)
    };

    const { error } = await supabaseClient
        .from("books")
        .update(updatedBook)
        .eq("id", currentEditId);

    if (error) {
        console.error("Update error:", error);
        return;
    }

    await loadLibrary();
await loadReadingLog();

    document.getElementById("bookModal").style.display = "none";
    currentEditId = null;
}

// ------------------------
// READING STATUS ACTIONS
// ------------------------

function markFinished(id) {
    const book = findBook(id);
    if (!book) return;

    book.status = "Finished";

    // optional: auto-fill finish date
    if (book.readingHistory?.length) {
        const last = book.readingHistory.at(-1);

        if (!last.finishDate) {
            last.finishDate =
                new Date().toISOString().split("T")[0];
        }
    }

    saveLibrary();
    renderLibrary();
    renderStats();


    openCurrentlyReadingModal();
}

function addReadingSession(id, startDate, endDate) {
    const book = findBook(id);
    if (!book) return;

    book.readingHistory ??= [];
    book.readingHistory.push({ startDate, endDate });

    saveLibrary();
    renderLibrary();
    renderStats();


}

// ------------------------
// EDIT MODE
// ------------------------

function openEditMode() {
    console.log("EDIT MODE OPENED, ID:", currentEditId);

    const book = findBook(currentEditId);
    if (!book) return;

    document.getElementById("editCoverInput").value = "";

    editTitle.value = book.title || "";
    editAuthor.value = book.author || "";
    editSeries.value = book.series || "";
    editGenre.value = book.genre || "";
    editISBN.value = book.isbn || "";
    editRating.value = book.rating || "";
    editStatus.value = book.status || "Unread";
    editNotes.value = book.notes || "";

    book.readingHistory ??= [];
    renderReadingHistory(book);
    renderShelfCheckboxes(book);

    document.getElementById("editTags").value =
        (book.tags || []).join(", ");

    editSection.style.display = "flex";
}

function cancelEdit() {

    currentEditId = null;

    document.getElementById("bookModal").style.display = "none";

    document.getElementById("editTitle").value = "";
    document.getElementById("editAuthor").value = "";
    document.getElementById("editSeries").value = "";
    document.getElementById("editGenre").value = "";
    document.getElementById("editISBN").value = "";
    document.getElementById("editRating").value = "";
    document.getElementById("editStatus").value = "Unread";
    document.getElementById("editNotes").value = "";
}

function updateCover() {

    const book = findBook(currentEditId);

    if (!book) return;

    const newCover =
        document.getElementById("editCoverInput")
            .value
            .trim();

    if (!newCover) return;

    book.cover = newCover;

    document.getElementById("detailCover").src =
        newCover;

    document.getElementById("editCoverInput").value = "";

    saveLibrary();

    renderLibrary();
    renderStats();

}
function closeManualAddModal() {

    document.getElementById("manualAddModal").style.display = "none";

    document.getElementById("manualTitle").value = "";
    document.getElementById("manualAuthor").value = "";
    document.getElementById("manualISBN").value = "";
    document.getElementById("manualGenre").value = "";
    document.getElementById("manualSeries").value = "";
    document.getElementById("manualCover").value = "";
    document.getElementById("manualNotes").value = "";
}
// ------------------------
// SEARCH (API LAYER)
// ------------------------

const liveSearchBooks = debounce(searchBooks, 1000);

// ========================
// 7 FILTER SYSTEM
// ========================

function getFilteredBooks() {

    let books = [...myLibrary];

    // ------------------------
    // 1. STAT FILTER (status from stats panel)
    // ------------------------
    if (window.statFilter) {
        books = books.filter(
            b => b.status === window.statFilter
        );
    }

    // ------------------------
    // 2. SEARCH QUERY FILTER
    // ------------------------
    const searchInput =
        document.getElementById("filterTitle");

    const query =
        (searchInput?.value || "")
            .toLowerCase()
            .trim();
if (query) {

    books = books.filter(book => {

        const searchText = [
            book.title,
            book.author,
            book.series,
            book.genre,
            book.isbn,
            book.notes,
            ...(book.shelves || []),
            ...(book.tags || []),
            ...(book.reading_history || []).map(r =>
                `${r.startDate || ""} ${r.endDate || ""}`
            )
        ]
            .join(" ")
            .toLowerCase();

        return searchText.includes(query);
    });
}


    // ------------------------
    // 4. SORTING
    // ------------------------
    const sort =
        filterSort?.value || "newest";

    switch (sort) {

        case "newest":
    books.sort(
        (a, b) =>
            (b.date_added || 0) - (a.date_added || 0)
    );
    break;

case "oldest":
    books.sort(
        (a, b) =>
            (a.date_added || 0) - (b.date_added || 0)
    );
    break;

        case "titleAZ":
            books.sort((a, b) =>
                (a.title || "").localeCompare(b.title || "")
            );
            break;

        case "titleZA":
            books.sort((a, b) =>
                (b.title || "").localeCompare(a.title || "")
            );
            break;
    }

    return books;
}

// ========================
// 8 EVENTS
// ========================

document.addEventListener("DOMContentLoaded", () => {

    // ========================
    // INITIAL LOAD
    // ========================
    loadLibrary();

    renderShelfNav();
    renderLibrary();
    renderStats();


    // ========================
    // HELPERS (DOM CACHE)
    // ========================
    const manualAddBtn =
        document.getElementById("openManualAddBtn");

    const closeManualAddBtn =
        document.getElementById("closeManualAddBtn");

    const saveManualBookBtn =
        document.getElementById("saveManualBookBtn");

    const searchBtn =
        document.getElementById("searchBtn");

    const searchInput =
        document.getElementById("searchInput");

    const addShelfBtn =
        document.getElementById("addShelfBtn");

    const addSessionBtn =
        document.getElementById("addReadingSessionBtn");

    const saveEditBtn =
        document.getElementById("saveEditBtn");

    const editBtn =
        document.getElementById("editBtn");

    const deleteBtn =
        document.getElementById("deleteBtn");

    const cancelEditBtn =
        document.getElementById("cancelEditBtn");

    const closeModalBtn =
        document.getElementById("closeModal");

    const openHabitBtn =
        document.getElementById("openHabitTrackerBtn");

    const closeHabitBtn =
        document.getElementById("closeHabitModal");

    const filterTitle =
        document.getElementById("filterTitle");

    const filterSort =
        document.getElementById("filterSort");

    // ========================
    // MOBILE
    // ========================

    document.getElementById("mobileMenuBtn")
        ?.addEventListener("click", () => {

            document.getElementById("sidebar")
                .classList.toggle("open");
        });

    document.addEventListener("click", (e) => {

        const sidebar = document.getElementById("sidebar");
        const button = document.getElementById("mobileMenuBtn");

        if (!sidebar || !button) return;

        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedButton = button.contains(e.target);

        if (!clickedInsideSidebar && !clickedButton) {
            sidebar.classList.remove("open");
        }
    });


    // ========================
    // MANUAL ADD MODAL
    // ========================
    manualAddBtn?.addEventListener("click", () => {
        renderManualShelfCheckboxes();
        document.getElementById("manualAddModal").style.display = "flex";
    });

    closeManualAddBtn?.addEventListener(
        "click",
        closeManualAddModal
    );

    saveManualBookBtn?.addEventListener(
        "click",
        saveManualBook
    );

    // ========================
    // SEARCH
    // ========================
    searchBtn?.addEventListener("click", searchBooks);

    searchInput?.addEventListener("keydown", e => {
        if (e.key === "Enter") searchBooks();
    });

    searchInput?.addEventListener("input", () => {

        const value = searchInput.value.trim();

        if (value.length < 2) {
            searchResults.innerHTML = "";
            return;
        }

        liveSearchBooks();
    });

    // ========================
    // SHELVES
    // ========================
    addShelfBtn?.addEventListener("click", addShelf);

    document.getElementById("saveShelfEditBtn").onclick = async () => {

        const newName = document
            .getElementById("editShelfName")
            .value.trim();

        const newColor =
            document.getElementById("colorPicker")
                .dataset.selectedColor;

        if (!newName) return;

        // update shelves
        shelves = shelves.map(s => {

            if (s.name === editingShelf.name) {
                return {
                    ...s,
                    name: newName,
                    color: newColor
                };
            }
            return s;
        });

        // update books
        myLibrary.forEach(book => {

            if (!book.shelves) return;

            book.shelves = book.shelves.map(s =>
                s === editingShelf.name ? newName : s
            );
        });

        saveLibrary();
        await supabaseClient
    .from("shelves")
    .update({
        name: newName,
        color: newColor
    })
    .eq("name", editingShelf.name);

        document.getElementById("shelfEditModal")
            .classList.add("hidden");

        renderShelfNav();
        renderLibrary();
        renderStats();
    };

    document.getElementById("cancelShelfEditBtn").onclick = () => {

        document.getElementById("shelfEditModal")
            .classList.add("hidden");

        editingShelf = null;
    };

    // ========================
    // READING SESSIONS
    // ========================
    addSessionBtn?.addEventListener("click", () => {

        const book = findBook(currentEditId);
        if (!book) return;

        if (!book.readingHistory) {
            book.readingHistory = [];
        }

        book.readingHistory.push({
            startDate: "",
            endDate: ""
        });

        renderReadingHistory(book);
    });

    document.getElementById("closeHabitModal")
        ?.addEventListener("click", () => {

            document.getElementById("habitModal")
                .style.display = "none";
        });

    // ========================
    // EDIT / SAVE / DELETE
    // ========================
    document.getElementById("editBtn").addEventListener("click", openEditMode);

    saveEditBtn?.addEventListener("click", saveEditedBook);

    document.getElementById("saveCoverBtn")
        .addEventListener("click", updateCover);

    editBtn?.addEventListener("click", () => {

        const book = findBook(currentEditId);
        if (!book) return;

        document.getElementById("editSection").style.display = "flex";

        document.getElementById("editTitle").value = book.title || "";
        document.getElementById("editAuthor").value = book.author || "";
        document.getElementById("editSeries").value = book.series || "";
        document.getElementById("editGenre").value = book.genre || "";
        document.getElementById("editISBN").value = book.isbn || "";
        document.getElementById("editRating").value = book.rating || "";
        document.getElementById("editStatus").value = book.status || "";
        document.getElementById("editNotes").value = book.notes || "";

        renderShelfCheckboxes(book);
    });

    deleteBtn?.addEventListener("click", () => {

        if (!confirm("Remove this book from your library?")) return;

        removeBook(currentEditId);

        document.getElementById("bookModal").style.display = "none";
    });

    cancelEditBtn?.addEventListener("click", cancelEdit);

    closeModalBtn?.addEventListener("click", () => {
        document.getElementById("bookModal").style.display = "none";
    });

    document.getElementById("exportLibraryBtn")
    ?.addEventListener("click", exportLibrary);

document.getElementById("importLibraryBtn")
    ?.addEventListener("click", () => {
        document.getElementById("importFileInput").click();
    });

document.getElementById("importFileInput")
    ?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) importLibraryFile(file);
    });

    // ========================
    // HABIT TRACKER
    // ========================
    openHabitBtn?.addEventListener("click", () => {
        renderHabitModal();
        document.getElementById("habitModal").style.display = "flex";
    });

    closeHabitBtn?.addEventListener("click", () => {
        document.getElementById("habitModal").style.display = "none";
    });

    document.getElementById("openCurrentlyReadingBtn")
        ?.addEventListener("click", openCurrentlyReadingModal);

    document.getElementById("openReadingDashboardBtn")
        ?.addEventListener("click", openReadingDashboard);
    document.getElementById("openReadingLogBtn")
        ?.addEventListener("click", openReadingLogDashboard);

    // ========================
    // FILTERS
    // ========================
    filterTitle?.addEventListener("input", () => {
        renderLibrary();
        renderStats();
    });

    filterSort?.addEventListener("change", () => {
        renderLibrary();
        renderStats();
    });
});

window.removeBook = removeBook;
window.confirmRemoveBook = confirmRemoveBook;
window.markFinished = markFinished;