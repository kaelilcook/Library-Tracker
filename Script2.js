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

let activeTag = null;

let currentEditId = null;

let lastSearchQuery = "";

const BOOKS_PER_PAGE = 50;

let visibleBookCount = BOOKS_PER_PAGE;

let finishingBookId = null;
let selectedFinishRating = null;

let friends = [];

let notifications = [];

let currentFriendProfileData = null;
let currentFriendProfileTab = "profile";
let currentFriendProfileId = null;

let currentReadingCircle = null;

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
async function initializeApp() {

    await ensureProfileExists();

    await loadProfile();

    await loadFriends();

    await loadShelves();

    await loadReadingGoal(
        new Date().getFullYear()
    );

    await loadLibrary();

    await updateNotificationBadge();

    await loadMyReadingCircles();


    renderApp();

}

function renderApp() {

    renderShelfNav();

    renderLibrary();

    renderStats();

    renderAnnualReport();

    renderCollectionHighlights();
}

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

function formatShortDate(dateString) {

    if (!dateString) return "";

    return new Date(dateString).toLocaleDateString(
        "en-US",
        {
            month: "short",
            day: "numeric"
        }
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

    console.log("Loading library...");

    const { data, error } =
        await supabaseClient
            .from("books")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("date_added", {
                ascending: false
            });

    if (error) {
        console.error(error);
        return;
    }

    myLibrary = data || [];

    await loadReadingLog();
}

async function updateBook(book) {

    const { error } =
        await supabaseClient
            .from("books")
            .update({

                title: book.title,
                author: book.author,
                series: book.series,
                genre: book.genre,
                isbn: book.isbn,
                cover: book.cover,
                notes: book.notes,
                shelves: book.shelves,
                status: book.status,
                rating: book.rating,
                page_count: book.page_count,
                completed_date: book.completed_date,
                reading_history: book.reading_history,
                date_added: book.date_added,
                favorite: book.favorite,
                tags: book.tags

            })
            .eq("id", book.id)
            .eq("user_id", currentUser.id);

    if (error) {

        console.error("Error updating book:", error);

        return false;

    }

    return true;

}

async function loadShelves() {

    const { data, error } =
        await supabaseClient
            .from("shelves")
            .select("*")
            .order("name");

    if (error) {
        console.error("Shelf load error:", error);
        return;
    }

    shelves = data || [];

    renderShelfNav();
    renderManualShelfCheckboxes();
}

async function loadReadingLog() {

    if (!currentUser) {
        console.error("No authenticated user.");
        return;
    }

    const { data, error } = await supabaseClient
        .from("reading_log")
        .select("*")
        .eq("user_id", currentUser.id);

    if (error) {
        console.error(error);
        return;
    }

    readingLog = data.map(row => ({
        date: row.date,
        books: row.books || []
    }));

    console.log("Loaded reading log:", readingLog);
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
                user_id: currentUser.id,
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
    book.reading_History ||
    [],
                tags: book.tags || [],
                status: book.status,
                date_added:
    book.date_added ??
    book.date_Added ??
                    null,
                page_count: book.page_count || null,
                completed_date: book.completed_date || null,
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
            await loadShelves();
            await loadReadingGoal(
                new Date().getFullYear()
            );

            renderApp();

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
// MY COLLECTION
// ========================

function renderCollectionHighlights() {

    const container =
        document.getElementById("collectionHighlights");

    if (!container) return;

    const favorites =
        myLibrary.filter(b => b.favorite);

    const hallOfFame =
        myLibrary.filter(book => book.rating === 5);

    container.innerHTML = `

        <div class="report-card"
             id="favoritesTile">

            <h2>${favorites.length}</h2>

            <p>🔖 Favorites</p>

        </div>

        <div class="report-card"
             id="hallOfFameTile">

            <h2>${hallOfFame.length}</h2>

            <p>🏆 Hall of Fame</p>
            <p>My 5-Star Books</p>

        </div>

    `;
    document
        .getElementById("favoritesTile")
        ?.addEventListener("click", openFavorites);

    document
        .getElementById("hallOfFameTile")
        ?.addEventListener("click", () => {
            console.log("Hall of Fame clicked");
            openHallOfFame();
        });
}

function openFavorites() {

    const books =
        myLibrary.filter(b => b.favorite);

    openModalView(

        "🔖 Favorite Books",

        books.length
            ? renderBookGrid(books)
            : `
                <p class="empty-state">
                    No favorites yet.
                </p>
            `
    );
}

function openHallOfFame() {

    const books =
        myLibrary.filter(book => book.rating === 5);

    openModalView(
        "🏆 Hall of Fame",
        renderBookGrid(books)
    );
}

// ========================
// NOTIFICATIONS
// ========================
async function loadNotifications() {

    console.log("Loading notifications...");

    notifications = [];


    // --------------------------
    // Friend Requests
    // --------------------------

    const { data: friendRequests, error: friendError } =
        await supabaseClient
            .from("friendships")
            .select("*")
            .eq("friend_id", currentUser.id)
            .eq("status", "pending");


    if (friendError) {

        console.error(friendError);

        return;

    }


    const friendNotifications =
        await Promise.all(

            (friendRequests || []).map(async request => {


                const { data: profile } =
                    await supabaseClient
                        .from("profiles")
                        .select("*")
                        .eq("id", request.user_id)
                        .single();


                return {

                    ...request,

                    type: "friend_request",

                    sender: profile

                };


            })

        );


    notifications.push(
        ...friendNotifications
    );



    // --------------------------
    // Circle Invites
    // --------------------------

    const { data: circleInvites, error: circleError } =
        await supabaseClient
            .from("circle_invites")
            .select(`
                id,
                circle_id,
                sender_id,
                status
            `)
            .eq(
                "receiver_id",
                currentUser.id
            )
            .eq(
                "status",
                "pending"
            );


    if (circleError) {

        console.error(circleError);

        return;

    }

    console.log(
        "Circle invites found:",
        circleInvites
    );

    console.log(
        "Circle invite error:",
        circleError
    );

    const circleNotifications =
        await Promise.all(

            (circleInvites || []).map(async invite => {


                const { data: sender } =
                    await supabaseClient
                        .from("profiles")
                        .select("*")
                        .eq("id", invite.sender_id)
                        .single();



                const { data: circle } =
                    await supabaseClient
                        .from("reading_circles")
                        .select("*")
                        .eq("id", invite.circle_id)
                        .single();



                return {

                    ...invite,

                    type: "circle_invite",

                    sender,

                    circle

                };


            })

        );


    notifications.push(
        ...circleNotifications
    );


    console.log(
        "All notifications:",
        notifications
    );

}

function renderNotifications() {

    const container =
        document.getElementById(
            "notificationsList"
        );

    if (!notifications.length) {

        container.innerHTML =
            "<p>No notifications.</p>";

        return;

    }

    container.innerHTML =
        notifications.map(notification => `

            <div class="notification-card">

                <img
                    src="${notification.sender.avatar_url || ""
            }"
                    class="friend-avatar">

                <div class="notification-content">

                    <strong>
                        ${notification.sender.display_name ||
            notification.sender.username
            }
                    </strong>

                    <p>
    ${
            notification.type === "friend_request"

                ?
                "sent you a friend request."

                :

                `invited you to join ${notification.circle.name}.`
    }
</p>

                    <div class="notification-actions">

${
            notification.type === "friend_request"

                ?

                `
<button onclick="acceptFriendRequest('${notification.id}')">
Accept
</button>

<button onclick="declineFriendRequest('${notification.id}')">
Decline
</button>
`

                :

                `

<button onclick="acceptCircleInvite('${notification.id}')">
Accept
</button>

<button onclick="declineCircleInvite('${notification.id}')">
Decline
</button>

`

}

</div>

                </div>

            </div>

        `).join("");

}

async function updateNotificationBadge() {

    const badge =
        document.getElementById(
            "notificationBadge"
        );


    if (!badge) return;


    // Friend requests
    const { count: friendCount, error: friendError } =
        await supabaseClient
            .from("friendships")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq(
                "friend_id",
                currentUser.id
            )
            .eq(
                "status",
                "pending"
            );


    if (friendError) {

        console.error(friendError);

        return;

    }



    // Circle invites
    const { count: circleCount, error: circleError } =
        await supabaseClient
            .from("circle_invites")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq(
                "receiver_id",
                currentUser.id
            )
            .eq(
                "status",
                "pending"
            );


    if (circleError) {

        console.error(circleError);

        return;

    }



    const totalNotifications =
        (friendCount || 0) +
        (circleCount || 0);



    if (totalNotifications > 0) {

        badge.textContent =
            totalNotifications;

        badge.classList.remove(
            "hidden"
        );

    }

    else {

        badge.classList.add(
            "hidden"
        );

    }

}

async function openNotificationsModal() {

    await loadNotifications();

    renderNotifications();

    document
        .getElementById("notificationsModal")
        .classList.remove("modal-hidden");

}

function closeNotificationsModal() {

    document
        .getElementById("notificationsModal")
        .classList.add("modal-hidden");

}

document
    .getElementById("notificationsBtn")
    .addEventListener(
        "click",
        openNotificationsModal
);

// ========================
// READING CIRCLES
// ========================
function openCreateCircleModal() {

    document
        .getElementById("createCircleModal")
        .classList.remove("hidden");

}

function closeCreateCircleModal() {

    document
        .getElementById("createCircleModal")
        .classList.add("hidden");

}

async function createReadingCircle() {

    const name =
        document
            .getElementById("circleName")
            .value
            .trim();

    const description =
        document
            .getElementById("circleDescription")
            .value
            .trim();

    console.log(name);
    console.log(description);

    const {
        data: { user },
        error: userError
    } =
        await supabaseClient
            .auth
            .getUser();

    if (userError || !user) {

        console.error(userError);

        return;

    }

    console.log("Auth user:", user.id);

    const inviteCode =
        await generateUniqueInviteCode();

    const { data, error } =
        await supabaseClient
            .from("reading_circles")
            .insert({

                name,

                description,

                owner_id: user.id,

                invite_code: inviteCode,

                avatar_color: getRandomCircleColor()

            })
            .select()
            .single();

    if (error) {

        console.error(error);

        return;

    }

    const { error: memberError } =
        await supabaseClient
            .from("circle_members")
            .insert({
                circle_id: data.id,
                user_id: user.id
            });

    if (memberError) {

        console.error(memberError);

        return;

    }

    closeCreateCircleModal();

    document
        .getElementById("circleName")
        .value = "";

    document
        .getElementById("circleDescription")
        .value = "";
}

function getRandomCircleColor() {

    const colors = [

        "#8b4c5c",
        "#6b8e23",
        "#457b9d",
        "#e76f51",
        "#9b5de5",
        "#f4a261"

    ];


    return colors[
        Math.floor(
            Math.random() * colors.length
        )
    ];

}

const defaultCircleAvatars = [

    "images/circles/sunflowers.jpg",

    "images/circles/cat.jpg",

    "images/circles/duck.jpg",

    "images/circles/flowers.jpg",

    "images/circles/moon.jpg",

    "images/circles/fairy.jpg"

];

function getCircleAvatar(circle) {

    if (circle.avatar_url) {

        return `
            <div
                class="circle-avatar"
                style="
                    background:${circle.avatar_color};
                "
            >

                <img
                    src="${circle.avatar_url}"
                >

            </div>
        `;

    }


    return `

        <div
            class="circle-avatar default-circle-avatar"
            style="
                background:${circle.avatar_color || "#8b4c5c"};
            "
        >
            📚
        </div>

    `;

}

function renderCircleAvatarPicker() {

    return defaultCircleAvatars.map(image => `

        <img
            src="${image}"
            class="circle-avatar-option"
            onclick="selectCircleAvatar('${image}')"
        >

    `).join("");

}

let selectedCircleAvatar = "";

function selectCircleAvatar(image) {

    selectedCircleAvatar = image;

    document
        .getElementById(
            "selectedCircleAvatarPreview"
        ).src = image;


    document
        .querySelectorAll(".circle-avatar-option")
        .forEach(option =>
            option.classList.remove("selected")
        );


    document
        .querySelector(
            `[data-avatar="${image}"]`
        )
        ?.classList.add("selected");

}

async function generateUniqueInviteCode() {

    while (true) {

        const code = generateInviteCode();

        const { data } =
            await supabaseClient
                .from("reading_circles")
                .select("id")
                .eq("invite_code", code)
                .maybeSingle();

        if (!data) {

            return code;

        }

    }

}

async function loadMyReadingCircles() {

    const {
        data: { user },
        error
    } =
        await supabaseClient
            .auth
            .getUser();


    if (error || !user) {

        console.error(error);

        return;

    }


    const { data, error: memberError } =
        await supabaseClient
            .from("circle_members")
            .select(`
                circle_id
            `)
            .eq("user_id", user.id);


    if (memberError) {

        console.error(memberError);

        return;

    }


    console.log(data);


    const circleIds =
        data.map(member => member.circle_id);


    const { data: circles, error: circleError } =
        await supabaseClient
            .from("reading_circles")
            .select(`
            id,
            name,
            description,
            avatar_url,
            circle_members (
                user_id
            )
        `)
            .in("id", circleIds);


    if (circleError) {

        console.error(circleError);

        return;

    }


    console.log(circles);

    renderReadingCircles(circles);

}

function renderReadingCircles(circles) {

    const container =
        document.getElementById(
            "readingCirclesContainer"
        );

    if (!container) return;


    container.innerHTML =
        circles.map(circle => {

            const memberCount =
                circle.circle_members?.length || 0;


            return `

            <div class="circle-card">

                ${getCircleAvatar(circle)}

                <h3>
                    ${circle.name}
                </h3>

                <p>
                    ${circle.description || ""}
                </p>

                <p>
                    👥 ${memberCount} members
                </p>

                <button
                    onclick="openReadingCircle('${circle.id}')">
                    Open Circle
                </button>

            </div>

            `;

        }).join("");

}

async function openReadingCircle(circleId) {

    console.log("Opening circle:", circleId);

    //
    // Load the circle itself
    //

    const { data: circle, error: circleError } =
        await supabaseClient
            .from("reading_circles")
            .select("*")
            .eq("id", circleId)
            .single();

    if (circleError) {

        console.error(circleError);

        return;

    }

    //
    // Load the members
    //

    const { data: members, error: memberError } =
        await supabaseClient
            .from("circle_members")
            .select(`
                user_id,
                profiles(
                    display_name,
                    avatar_url
                )
            `)
            .eq("circle_id", circleId);

    if (memberError) {

        console.error(memberError);

        return;

    }

    //
    // Load shared books
    //

    const { data: sharedBooks, error: booksError } =
        await supabaseClient
            .from("circle_books")
            .select(`
                *,
                books(
                    title,
                    author,
                    cover,
                    status,
                    rating
                ),
                profiles(
                    display_name,
                    avatar_url
                )
            `)
            .eq("circle_id", circleId);

    if (booksError) {

        console.error(booksError);

        return;

    }

    currentReadingCircle = {

        circle,

        members,

        sharedBooks

    };

    console.log(currentReadingCircle);

    renderReadingCircle(currentReadingCircle);

    document
        .getElementById("readingCircleModal")
        .classList.remove("hidden");

}

function closeReadingCircleModal() {

    document
        .getElementById("readingCircleModal")
        .classList.add("hidden");

}

function renderReadingCircle(data) {

    const container =
        document.getElementById(
            "readingCircleContent"
        );

    container.innerHTML = `

        <section class="circle-header">
        

    <div class="circle-avatar-wrapper">

        ${getCircleAvatar(data.circle)}

    </div>


    <h2>
        ${data.circle.name}
    </h2>


    <p class="circle-description">
        ${data.circle.description || "A place to share books."}
    </p>


    <div class="circle-meta">

        <span>
            👥 ${data.members.length} readers
        </span>

        <span>
            📚 ${data.sharedBooks.length} books
        </span>

    </div>


    <div class="circle-actions">
    ${data.circle.owner_id === currentUser.id
            ? `
        <button onclick="openEditCircleModal()">
            ✏️ Edit Circle
        </button>
    `
            : ""
}

        <button
            onclick="openShareBookModal()">
            ➕ Share a Book
        </button>


        <button
    onclick="openInviteCircleModal()">

    🔗 Invite

</button>

    </div>


</section>


        <section>

            <h3>
                Members
            </h3>

            ${data.members.map(member => `

                <p>
                    ${member.profiles?.display_name || "Reader"}
                </p>

            `).join("")}

        </section>


        <section>

    <h3>
        Shared Books
    </h3>    

            ${
        data.sharedBooks.length

            ?

            data.sharedBooks.map(item => `

<div class="circle-book-card">

    <img
        src="${item.books.cover || ""}"
        class="circle-book-cover"
    >

    <div class="circle-book-info">

        <h4>
            ${item.books.title}
        </h4>

        <p>
            ${item.books.author || ""}
        </p>

        <small>
            Shared by 
            ${item.profiles?.display_name || "Reader"}
        </small>

    </div>

    <button
    onclick="updateCircleBookStatus('${item.id}')">

    ${item.status || "Set Status"}

</button>

</div>

`).join("")

            :

            "No shared books yet."

}

        </section>

    `;

}

function updateCircleBookStatus(circleBookId) {

    const status =
        prompt(
            "Choose status:\n\nCurrently Reading\nFinished\nWant to Read\nDNF"
        );


    if (!status) return;


    saveCircleBookStatus(
        circleBookId,
        status
    );

}

async function saveCircleBookStatus(
    circleBookId,
    status
) {


    const { error } =
        await supabaseClient
            .from("circle_books")
            .update({

                status

            })
            .eq(
                "id",
                circleBookId
            );


    if (error) {

        console.error(error);

        return;

    }


    openReadingCircle(
        currentReadingCircle.circle.id
    );

}

function openShareBookModal() {

    document
        .getElementById("shareBookModal")
        .classList.remove("hidden");

    renderShareBookSearch();

}


function closeShareBookModal() {

    document
        .getElementById("shareBookModal")
        .classList.add("hidden");

}

function renderShareBookSearch() {

    const input =
        document.getElementById(
            "circleBookSearch"
        );

    const results =
        document.getElementById(
            "circleBookResults"
        );


    input.addEventListener("input", () => {

        const query =
            input.value
                .toLowerCase()
                .trim();


        const matches =
            myLibrary
                .filter(book =>
                    book.title
                        .toLowerCase()
                        .includes(query)
                )
                .slice(0, 10);


        results.innerHTML =
            matches.map(book => `

                <div
                    class="circle-book-result"
                    onclick="shareBookToCircle('${book.id}')">

                    <img src="${book.cover || ""}">

                    <p>
                        ${book.title}
                    </p>

                    <small>
                        ${book.author || ""}
                    </small>

                </div>

            `).join("");

    });

}

async function shareBookToCircle(bookId) {

    if (!currentReadingCircle) {

        console.error("No circle selected.");

        return;

    }


    const {
        data: { user },
        error: userError
    } =
        await supabaseClient
            .auth
            .getUser();


    if (userError || !user) {

        console.error(userError);

        return;

    }


    const { data, error } =
        await supabaseClient
            .from("circle_books")
            .insert({

                circle_id:
                    currentReadingCircle.circle.id,

                user_id:
                    user.id,

                book_id:
                    bookId,

                status:
                    "Want to Read"

            })
            .select()
            .single();


    if (error) {

        console.error(error);

        return;

    }


    console.log("Book added to circle:", data);


    closeShareBookModal();


    // reload circle data

    openReadingCircle(
        currentReadingCircle.circle.id
    );

}

function openEditCircleModal() {

    const circle =
        currentReadingCircle.circle;


    document.getElementById("editCircleName").value =
        circle.name;


    document.getElementById("editCircleDescription").value =
        circle.description || "";


    selectedCircleAvatar =
        circle.avatar_url || "";

    document.getElementById(
        "selectedCircleAvatarPreview"
    ).src = selectedCircleAvatar;


    document.getElementById(
        "circleAvatarPicker"
    ).innerHTML =
        renderCircleAvatarPicker();


    document
        .getElementById("editCircleModal")
        .classList.remove("hidden");

}

async function saveCircleEdits() {

    const updates = {

        name:
            document
                .getElementById("editCircleName")
                .value
                .trim(),

        description:
            document
                .getElementById("editCircleDescription")
                .value
                .trim(),

        avatar_url:
            selectedCircleAvatar

    };


    const { error } =
        await supabaseClient
            .from("reading_circles")
            .update(updates)
            .eq(
                "id",
                currentReadingCircle.circle.id
            );


    if (error) {

        console.error(error);
        return;

    }


    closeEditCircleModal();


    openReadingCircle(
        currentReadingCircle.circle.id
    );

}

function closeEditCircleModal() {

    document
        .getElementById("editCircleModal")
        .classList.add("hidden");

} 

function openInviteCircleModal() {

    document.getElementById("inviteCircleAvatar").src =
        currentReadingCircle.circle.avatar_url ||
        "images/default-circle.png";

    document.getElementById("inviteCircleName").textContent =
        currentReadingCircle.circle.name;

    document.getElementById("inviteCircleMembers").textContent =
        `👥 ${currentReadingCircle.members.length} readers`;

    document.getElementById("inviteCircleCode").textContent =
        currentReadingCircle.circle.invite_code;

    document
        .getElementById("inviteCircleModal")
        .classList.remove("hidden");

    loadCircleFriends();

}

function closeInviteCircleModal() {

    document
        .getElementById("inviteCircleModal")
        .classList.add("hidden");

}

async function copyInviteCode() {

    await navigator.clipboard.writeText(
        currentReadingCircle.circle.invite_code
    );

    alert("Invite code copied!");

}

async function loadCircleFriends() {

    const {
        data: { user },
        error: userError
    } =
        await supabaseClient
            .auth
            .getUser();

    if (userError || !user) {

        console.error(userError);

        return;

    }

    const { data: friendships, error } =
        await supabaseClient
            .from("friendships")
            .select(`
            user_id,
            friend_id
        `)
            .eq("status", "accepted")
            .or(
                `user_id.eq.${user.id},friend_id.eq.${user.id}`
            );

    if (error) {

        console.error(error);

        return;

    }

    const friendIds =
        friendships.map(friendship =>

            friendship.user_id === user.id
                ? friendship.friend_id
                : friendship.user_id

        );

    console.log(friendIds);

    const {
        data: profiles,
        error: profileError
    } =
        await supabaseClient
            .from("profiles")
            .select(`
            id,
            display_name,
            avatar_url
        `)
            .in("id", friendIds);

    const container =
        document.getElementById(
            "circleFriendList"
        );

    console.log(profiles);

    container.innerHTML =
        profiles.map(profile => `

        <div class="circle-friend-row">

            <img
                src="${profile.avatar_url || "images/default-avatar.svg"}"
                class="friend-avatar">

            <div class="circle-friend-info">

                <strong>
                    ${profile.display_name}
                </strong>

            </div>

            <button
                onclick="inviteFriend('${profile.id}')">

                Invite

            </button>

        </div>

    `).join("");

    console.log(friends);

}

async function inviteFriend(friendId) {

    const {
        data: { user },
        error: userError
    } =
        await supabaseClient
            .auth
            .getUser();

    if (userError || !user) {

        console.error(userError);

        return;

    }

    const { data: session } =
        await supabaseClient.auth.getSession();

    console.log(session.session.user);
    console.log(session.session.user.aud);

    const { error } =
        await supabaseClient
            .from("circle_invites")
            .insert({
                circle_id: currentReadingCircle.circle.id,
                sender_id: user.id,
                receiver_id: friendId,
                status: "pending"
            });

    if (error) {

        console.error(error);

        return;

    }

    console.log("Invite sent successfully!");

    alert("Invitation sent!");

}

async function acceptCircleInvite(inviteId) {

    const {
        data: { user },
        error: userError
    } =
        await supabaseClient
            .auth
            .getUser();


    if (userError || !user) {

        console.error(userError);
        return;

    }


    // Get the invitation

    const { data: invite, error: inviteError } =
        await supabaseClient
            .from("circle_invites")
            .select("*")
            .eq("id", inviteId)
            .single();


    if (inviteError) {

        console.error(inviteError);
        return;

    }



    // Add user to circle members

    const { error: memberError } =
        await supabaseClient
            .from("circle_members")
            .insert({

                circle_id:
                    invite.circle_id,

                user_id:
                    user.id

            });


    if (memberError) {

        console.error(memberError);
        return;

    }



    // Update invite status

    const { error: updateError } =
        await supabaseClient
            .from("circle_invites")
            .update({

                status: "accepted"

            })
            .eq(
                "id",
                inviteId
            );


    if (updateError) {

        console.error(updateError);
        return;

    }


    console.log(
        "Joined reading circle!"
    );


    await loadNotifications();

    renderNotifications();

    updateNotificationBadge();

}

// ========================
// FRIENDS
// ========================
async function loadFriends() {

    const { data, error } =
        await supabaseClient
            .from("friendships")
            .select("*")
            .eq("status", "accepted")
            .or(
                `user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`
            );


    if (error) {
        console.error(error);
        return;
    }


    const friendIds =
        data.map(row =>
            row.user_id === currentUser.id
                ? row.friend_id
                : row.user_id
        );


    const { data: profiles, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select(`
            id,
            username,
            display_name,
            avatar_url,
            bio,
            favorite_book,
            favorite_author,
            favorite_genre
        `)
            .in("id", friendIds);

    if (profileError) {

        console.error(profileError);

        return;

    }


    friends = profiles || [];

    renderFriends();
}

function renderFriends() {

    const container =
        document.getElementById("friendsList");

    if (!container) return;


    if (!friends.length) {

        container.innerHTML = `
            <p class="empty-friends">
                No friends yet.
            </p>
        `;

        return;
    }


    container.innerHTML =
        friends.map(friend => {

            return `
<div class="friend-item"
     data-user-id="${friend.id}">

    <img
        src="${friend.avatar_url || ""}"
        class="friend-avatar">

    <span class="friend-name">
        ${friend.display_name || friend.username}
    </span>

</div>
`;

        }).join("");

    document
        .querySelectorAll(".friend-item")
        .forEach(item => {

            const friend =
                friends.find(f =>
                    f.id === item.dataset.userId
                );


            if (!friend) return;


            item.addEventListener(
                "click",
                e => {

                    e.stopPropagation();

                    showFriendPreviewCard(
                        friend,
                        e.clientX,
                        e.clientY
                    );

                }
            );

        });
}

document.addEventListener(
    "click",
    e => {

        const card =
            document.getElementById(
                "friendPreviewCard"
            );


        const clickedFriend =
            e.target.closest(
                ".friend-item"
            );


        if (
            card &&
            card.classList.contains("visible") &&
            !card.contains(e.target) &&
            !clickedFriend
        ) {

            hideFriendPreviewCard();

        }

    }
);

function openFriendModal() {

    document
        .getElementById("friendModal")
        .classList
        .remove("modal-hidden");

    document
        .getElementById("friendSearchInput")
        .focus();

}

function closeFriendModal() {

    document
        .getElementById("friendModal")
        .classList
        .add("modal-hidden");

}

async function searchFriends() {

    const search =
        document
            .getElementById("friendSearchInput")
            .value
            .trim();

    if (!search) return;

    console.log("Searching:", search);

    const isFriendCode =
        search.length === 8;

    console.log(isFriendCode);

    let query =
        supabaseClient
            .from("profiles")
            .select("*");

    if (isFriendCode) {

        query =
            query.eq(
                "friend_code",
                search.toUpperCase()
            );

    }

    else {

        query =
            query.ilike("username", `%${search}%`);

    }

    const { data, error } =
        await query;

    if (error) {

        console.error(error);

        return;

    }

    renderFriendSearchResults(data);
}

function renderFriendSearchResults(results) {

    const container =
        document.getElementById(
            "friendSearchResults"
        );

    if (!results.length) {

        container.innerHTML =
            "<p>No users found.</p>";

        return;
    }


    container.innerHTML =
        results.map(user => `

            <div class="friend-result">

                <img
                    src="${user.avatar_url || ""}"
                    class="friend-avatar">

                <div class="friend-info">

                    <strong>
                        ${user.display_name ||
            user.username}
                    </strong>

                    <small>
                        @${user.username}
                    </small>

                </div>


                <button
                    class="add-friend-result-btn"
                    data-user-id="${user.id}">
                    Add Friend
                </button>

            </div>

        `).join("");


    document
        .querySelectorAll(".add-friend-result-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const friendId =
                        button.dataset.userId;

                    button.disabled = true;
                    button.textContent = "Sending...";

                    await sendFriendRequest(friendId);

                    button.textContent = "Request Sent";

                }
            );

        });

}

async function sendFriendRequest(friendId) {

    console.log("Sending friend request to:", friendId);

    if (!currentUser) {
        console.error("No logged in user.");
        return;
    }

    const { data: existing, error: checkError } =
        await supabaseClient
            .from("friendships")
            .select("*")
            .or(
                `and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`
            );

    if (checkError) {

        console.error(
            "Friendship check failed:",
            checkError
        );
        return;
    }

    if (existing.length) {

        alert(
            "A friendship request already exists."
        );
        return;
    }

    const { error } =
        await supabaseClient
            .from("friendships")
            .insert({

                user_id: currentUser.id,

                friend_id: friendId,

                status: "pending"
            });

    if (error) {

        console.error(
            "Friend request failed:",
            error
        );

        alert(error.message);

        return;
    }

    alert(
        "Friend request sent!"
    );

    console.log(
        "Friend request sent successfully"
    );
}

async function loadFriendRequests() {

    const container =
        document.getElementById(
            "notificationsList"
        );


    const { data, error } =
        await supabaseClient
            .from("friendships")
            .select(`
                id,
                user_id,
                created_at,
                profiles:user_id (
                    username,
                    display_name,
                    avatar_url
                )
            `)
            .eq(
                "friend_id",
                currentUser.id
            )
            .eq(
                "status",
                "pending"
            );

    if (error) {

        console.error(error);
        return;

    }

    if (!data.length) {

        container.innerHTML = `
            <p>
                No new requests.
            </p>
        `;

        return;

    }

    container.innerHTML =
        data.map(request => `

            <div class="friend-request">

                <img 
                src="${request.profiles.avatar_url || ""}"
                class="friend-avatar">


                <span>
                    ${request.profiles.display_name ||
            request.profiles.username
            }
                </span>


                <button
                onclick="acceptFriendRequest('${request.id}')">
                    Accept
                </button>

                <button
                onclick="declineFriendRequest('${request.id}')">
                    Decline
                </button>

            </div>

        `).join("");

}

async function acceptFriendRequest(friendshipId) {

    const { error } =
        await supabaseClient
            .from("friendships")
            .update({
                status: "accepted"
            })
            .eq(
                "id",
                friendshipId
            );


    if (error) {

        console.error(
            "Accept request failed:",
            error
        );

        alert(error.message);

        return;
    }


    console.log(
        "Friend request accepted"
    );


    await loadFriendRequests();

    await updateNotificationBadge();

    await loadFriends();

}

async function declineFriendRequest(friendshipId) {


    const { error } =
        await supabaseClient
            .from("friendships")
            .delete()
            .eq(
                "id",
                friendshipId
            );


    if (error) {

        console.error(
            "Decline failed:",
            error
        );

        return;

    }


    console.log(
        "Friend request declined"
    );


    await loadFriendRequests();

    await updateNotificationBadge();

}

// ========================
// FRIEND PROFILES
// ========================
async function showFriendPreviewCard(friend, x, y) {
    
    console.log(
        "Opening friend card",
        friend.username,
        x,
        y
    );

    const currentlyReading =
        await getFriendCurrentlyReading(friend.id);

    const finishedCount =
        await getFriendFinishedCount(friend.id);

    const averageRating =
        await getFriendAverageRating(friend.id);

    const topAuthor =
        await getFriendTopAuthorThisYear(friend.id);

    const topGenre =
        await getFriendTopGenre(friend.id);

    const card =
        document.getElementById(
            "friendPreviewCard"
        );

    console.log("Card:", card);


    card.innerHTML =
        buildFriendPreview(
            friend,
            currentlyReading,
            finishedCount,
            averageRating,
            topAuthor,
            topGenre
        );

    const isMobile =
        window.matchMedia("(hover: none)").matches;


    if (isMobile) {

        card.style.left = "";
        card.style.top = "";
        card.style.right = "";
        card.style.bottom = "";

    } else {

        card.style.left = "320px";
        card.style.top = "120px";

    }


    card.classList.remove(
        "hidden"
    );


    card.classList.add(
        "visible"
    );

    console.log(
        card.className
    );


    document
        .getElementById("previewProfileBtn")
        .onclick = () => {

            openFriendProfile(friend.id);

        };

}

function buildFriendPreview(
    friend,    
    currentlyReading,
    finishedCount,
    averageRating, 
    topAuthor,
    topGenre
) {

    
    return `

        <img
            src="${friend.avatar_url || ""}"
            class="friend-large-avatar">

        <h3>
            ${friend.display_name || friend.username}
        </h3>

        <p class="preview-username">
            @${friend.username}
        </p>

        <p class="preview-bio">
           👤 ${friend.bio || "No bio yet."}
        </p>

        <div class="preview-divider"></div>

       <div class="preview-row currently-reading-preview">

    <span>📖 Featured Reading</span>


    ${
        currentlyReading
            ?
            `
        <div class="current-book">

            <img
                src="${currentlyReading.cover || "default-cover.png"}"
                class="preview-book-cover"
                alt="Book cover">


            <div class="current-book-info">

                <strong>
                    ${currentlyReading.title}
                </strong>


                <small>
                    ${currentlyReading.author || ""}
                </small>

            </div>

        </div>
        `
            :
            `
        <strong>
            Nothing right now
        </strong>
        `
    }

</div>

<div class="preview-row">

    <span>📚 Finished This Year</span>

    <strong>
        ${finishedCount} books
    </strong>

</div>

<div class="preview-row">

    <span>⭐ Average Rating</span>

    <strong>
        ${
        averageRating
            ? `${averageRating} / 5`
            : "No ratings yet"
        }
    </strong>

</div>

        <div class="preview-row">

    <span> ✍️ Most Read Author</span>

    <strong>
        ${
        topAuthor
            ? topAuthor
            : "No finished books yet"
        }
    </strong>

</div>

        <div class="preview-row">

    <span>🏷️ Top Genre Read</span>

    <strong>
        ${
        topGenre
            ? topGenre
            : "No finished books yet"
        }
    </strong>

</div>

        <button id="previewProfileBtn">
            View Full Profile
        </button>

    `;

}

function hideFriendPreviewCard() {

    const card =
        document.getElementById(
            "friendPreviewCard"
        );

    card.classList.remove(
        "visible"
    );

    card.classList.add(
        "hidden"
    );

    const closePreviewCardButton =
        document.querySelector(".close-preview-card");


    if (closePreviewCardButton) {

        closePreviewCardButton.addEventListener(
            "click",
            () => {

                hideFriendPreviewCard();

            }
        );

    }

}

async function getFriendCurrentlyReading(friendId) {

    // Step 1: Get the featured book ID
    const { data: profile, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("featured_reading_book_id")
            .eq("id", friendId)
            .single();

    if (profileError) {

        console.error(profileError);

        return null;

    }

    // Step 2: If they chose one, load it
    if (profile.featured_reading_book_id) {

        const { data: featuredBook, error } =
            await supabaseClient
                .from("books")
                .select("*")
                .eq(
                    "id",
                    profile.featured_reading_book_id
                )
                .single();

        if (!error && featuredBook) {

            return featuredBook;

        }

    }

    // Step 3: Otherwise fall back
    const { data: readingBooks, error } =
        await supabaseClient
            .from("books")
            .select("*")
            .eq("user_id", friendId)
            .eq("status", "Reading");

    if (error) {

        console.error(error);

        return null;

    }

    if (!readingBooks.length) {

        return null;

    }

    return readingBooks[0];

}

async function getFeaturedReadingBookId() {

    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("featured_reading_book_id")
            .eq("id", currentUser.id)
            .single();

    if (error) {

        console.error(error);

        return null;

    }

    return data.featured_reading_book_id;

}

async function setFeaturedReadingBook(bookId) {

    const { error } =
        await supabaseClient
            .from("profiles")
            .update({
                featured_reading_book_id: bookId
            })
            .eq(
                "id",
                currentUser.id
            );

    if (error) {

        console.error(
            "Failed to set featured reading book:",
            error
        );
        return;
    }

    console.log(
        "Featured reading book saved:",
        bookId
    );
}

async function getFriendFinishedCount(friendId) {

    const currentYear =
        new Date().getFullYear();


    const startOfYear =
        `${currentYear}-01-01`;


    const startOfNextYear =
        `${currentYear + 1}-01-01`;


    const { count, error } =
        await supabaseClient
            .from("books")
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            )
            .eq(
                "user_id",
                friendId
            )
            .eq(
                "status",
                "Finished"
            )
            .gte(
                "completed_date",
                startOfYear
            )
            .lt(
                "completed_date",
                startOfNextYear
            );


    if (error) {

        console.error(
            "Error loading finished count:",
            error
        );

        return 0;

    }


    return count || 0;

}

async function getFriendAverageRating(friendId) {

    const { data, error } =
        await supabaseClient
            .from("books")
            .select("rating")
            .eq(
                "user_id",
                friendId
            )
            .not(
                "rating",
                "is",
                null
            );


    if (error) {

        console.error(
            "Error loading average rating:",
            error
        );

        return null;

    }


    if (!data.length) {

        return null;

    }


    const total =
        data.reduce(
            (sum, book) =>
                sum + book.rating,
            0
        );


    return (
        total / data.length
    ).toFixed(1);

}

async function getFriendTopAuthorThisYear(userId) {

    const currentYear =
        new Date().getFullYear();


    const { data, error } =
        await supabaseClient
            .from("books")
            .select(`
                author,
                completed_date
            `)
            .eq("user_id", userId)
            .eq("status", "Finished");


    if (error) {

        console.error(error);

        return "None yet";

    }


    const yearlyBooks =
        data.filter(book => {

            if (!book.completed_date)
                return false;


            return new Date(
                book.completed_date
            ).getFullYear() === currentYear;

        });


    const authorCounts = {};


    yearlyBooks.forEach(book => {

        if (!book.author)
            return;


        authorCounts[book.author] =
            (authorCounts[book.author] || 0) + 1;

    });


    return (
        Object.entries(authorCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0]
        ||
        "None yet"
    );

}

async function getFriendFavoriteAuthor(friendId) {

    const { data, error } =
        await supabaseClient
            .from("books")
            .select("author")
            .eq(
                "user_id",
                friendId
            )
            .eq(
                "status",
                "Finished"
            )
            .not(
                "author",
                "is",
                null
            );


    if (error) {

        console.error(
            "Error loading favorite author:",
            error
        );

        return null;

    }


    if (!data.length) {

        return null;

    }


    const authorCounts = {};


    data.forEach(book => {

        const author =
            book.author;


        if (!author) return;


        if (authorCounts[author]) {

            authorCounts[author]++;

        } else {

            authorCounts[author] = 1;

        }

    });


    const favoriteAuthor =
        Object.keys(authorCounts)
            .sort(
                (a, b) =>
                    authorCounts[b] -
                    authorCounts[a]
            )[0];


    return favoriteAuthor || null;

    console.log(
        "Finished books for author calculation:",
        data
    );

}

async function getFriendTopGenre(friendId) {

    const { data, error } =
        await supabaseClient
            .from("books")
            .select("genre")
            .eq(
                "user_id",
                friendId
            )
            .eq(
                "status",
                "Finished"
            )
            .not(
                "genre",
                "is",
                null
            );

    if (error) {

        console.error(
            "Error loading top genre:",
            error
        );

        return null;

    }

    if (!data.length) {

        return null;

    }

    const genreCounts = {};

    data.forEach(book => {

        const genre = book.genre;

        if (!genre) return;

        genreCounts[genre] =
            (genreCounts[genre] || 0) + 1;

    });

    const topGenre =
        Object.keys(genreCounts)
            .sort(
                (a, b) =>
                    genreCounts[b] -
                    genreCounts[a]
            )[0];

    return topGenre || null;

}

// ========================
// FULL PROFILE MODAL
// ========================

async function getUserProfile(userId) {

    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select(`
                id,
                username,
                display_name,
                avatar_url,
                bio,
                favorite_book,
                favorite_author,
                favorite_genre
            `)
            .eq("id", userId)
            .single();

    if (error) {

        console.error(error);

        return null;

    }

    return data;

}
function closeFriendProfileModal() {

    document
        .getElementById("friendProfileModal")
        .classList
        .add("modal-hidden");

}

async function openFriendProfile(userId) {

    const profile =
        await getUserProfile(userId);

    if (!profile) return;

    const books =
        await getFriendBooks(userId);

    const readingSnapshot =
        await getFriendReadingSnapshot(userId);

    const recentActivity =
        await getFriendRecentActivity(userId);

    const readingGoal =
        await getFriendReadingGoal(userId);

    currentFriendProfileData = {

        profile,

        books,

        readingSnapshot,

        recentActivity,

        readingGoal

    };

    renderFriendProfile(currentFriendProfileData);

    document
        .getElementById("friendProfileModal")
        .classList.remove("modal-hidden");

}


async function getFriendBooks(userId) {

    const { data, error } =
        await supabaseClient
            .from("books")
            .select("*")
            .eq("user_id", userId);

    if (error) {

        console.error(error);

        return [];

    }

    return data;

}

async function getFriendReadingSnapshot(userId) {   

    const currentYear =
        new Date().getFullYear();

    const { data, error } =
        await supabaseClient
            .from("books")
            .select(`
    completed_date,
    page_count,
    rating,
    author,
    genre
`)
            .eq("user_id", userId)
            .eq("status", "Finished");

    if (error) {

        console.error(error);

        return null;

    }

    const yearlyBooks =
        data.filter(book => {

            if (!book.completed_date)
                return false;

            return new Date(
                book.completed_date
            ).getFullYear() === currentYear;

        });

    const booksRead =
        yearlyBooks.length;

    const pagesRead =
        data
            .filter(book => {

                if (!book.completed_date)
                    return false;

                return new Date(
                    book.completed_date
                ).getFullYear() === currentYear;

            })
            .reduce((total, book) => {

                return total + (book.page_count || 0);

            }, 0);

    const ratedBooks =
        data.filter(book => {

            if (!book.completed_date)
                return false;

            if (!book.rating)
                return false;

            return new Date(
                book.completed_date
            ).getFullYear() === currentYear;

        });


    const averageRating =
        ratedBooks.length
            ?
            (
                ratedBooks.reduce(
                    (total, book) => {

                        return total + book.rating;

                    },
                    0
                )
                /
                ratedBooks.length
            ).toFixed(1)

            :
            0;

    const authorCounts = {};

    yearlyBooks.forEach(book => {

        if (!book.author) return;

        authorCounts[book.author] =
            (authorCounts[book.author] || 0) + 1;

    });


    const topAuthor =
        Object.entries(authorCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0]
        || "None yet";

    const genreCounts = {};

    yearlyBooks.forEach(book => {

        if (!book.genre) return;

        genreCounts[book.genre] =
            (genreCounts[book.genre] || 0) + 1;

    });


    const topGenre =
        Object.entries(genreCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0]
        || "None yet";

    return {

    booksRead,
    pagesRead, 
    averageRating,
        topAuthor,
    topGenre
};    

}

async function getFriendRecentActivity(userId) {

    const { data, error } =
        await supabaseClient
            .from("books")
            .select("*")
            .eq("user_id", userId);

    if (error) {

        console.error(error);

        return [];

    }

    const activities = [];

    for (const book of data) {

        activities.push({

            type: "added",

            title: book.title,

            author: book.author,

            cover: book.cover,

            date: book.date_added

        });

        (book.reading_history || []).forEach(session => {

            if (session.startDate) {

                activities.push({

                    type: "started",

                    title: book.title,

                    author: book.author,

                    cover: book.cover,

                    date: session.startDate

                });

            }

            if (

                session.endDate &&

                book.status === "Finished"

            ) {

                activities.push({

                    type: "finished",

                    title: book.title,

                    author: book.author,

                    cover: book.cover,

                    rating: book.rating,

                    date: session.endDate

                });

            }

            if (

                session.endDate &&

                book.status === "DNF"

            ) {

                activities.push({

                    type: "dnf",

                    title: book.title,

                    author: book.author,

                    cover: book.cover,

                    date: session.endDate

                });

            }

        });

        if (book.rating > 0) {

            activities.push({

                type: "rated",

                title: book.title,

                author: book.author,

                cover: book.cover,

                rating: book.rating,

                date: book.completed_date

            });

        }

    }

    activities.sort((a, b) =>

        new Date(b.date) -

        new Date(a.date)

    );

    return activities.slice(0, 15);

}

function getActivityIcon(type) {

    switch (type) {

        case "added":
            return "📚";

        case "started":
            return "📖";

        case "finished":
            return "🏁";

        case "rated":
            return "⭐";

        case "dnf":
            return "🚫";

        default:
            return "📚";

    }

}

function getActivityText(activity) {

    switch (activity.type) {


        case "added":

            return "Added to library";


        case "started":

            return "Started reading";


        case "finished":

            return "Finished reading";


        case "rated":

            return `Rated ${activity.rating}/5`;


        case "dnf":

            return "Marked as DNF";


        default:

            return "";

    }

}

async function getFriendReadingHistory(userId) {

    const { data, error } =
        await supabaseClient
            .from("books")
            .select(`
                title,
                author,
                cover,
                completed_date,
                rating,
                genre
            `)
            .eq("user_id", userId)
            .eq("status", "Finished")
            .order(
                "completed_date",
                {
                    ascending: false
                }
            );

    if (error) {

        console.error(error);

        return [];

    }

    return data;

}

function formatHistoryDate(date) {

    if (!date) return "";

    return new Date(date)
        .toLocaleDateString(
            "en-US",
            {
                month: "long",
                day: "numeric",
                year: "numeric"
            }
        );

}

async function getFriendReadingGoal(userId) {

    const currentYear =
        new Date().getFullYear();

    const { data, error } =
        await supabaseClient
            .from("reading_goals")
            .select("*")
            .eq("user_id", userId)
            .eq("year", currentYear)
            .maybeSingle();

    if (error || !data) {

        return {

            year: currentYear,

            books_goal: 0

        };

    }

    return data;
}

function switchFriendProfileTab(tab) {

    currentFriendProfileTab = tab;

    renderFriendProfile(currentFriendProfileData);

}

function renderFriendProfile(data) {

    const container =
        document.getElementById(
            "friendProfileContent"
        );

    container.innerHTML = `

        ${renderProfileHeader(data.profile)}

        ${renderProfileTabs()}

        <div id="friendProfileTabContent">

            ${renderFriendProfileTab(data)}

        </div>

    `;

}

function renderFriendProfileTab(data) {

    if (currentFriendProfileTab === "profile") {

        return `

            ${renderCurrentReadingSection(
            data.books
        )}

            ${renderReadingStatsSection(
            data.readingSnapshot
        )}

            ${renderRecentActivitySection(
            data.recentActivity
        )}

        `;

    }


    if (currentFriendProfileTab === "goals") {

        return renderReadingGoalsTab(data);

    }

}

function renderReadingGoalsTab(data) {

    const year =
        new Date().getFullYear();

    const currentYear =
        new Date().getFullYear();

    const booksRead =
        data.books.filter(book => {

            if (!book.completed_date)
                return false;

            return (
                new Date(book.completed_date)
                    .getFullYear() === currentYear
            );

        });

    booksRead.sort((a, b) =>
        new Date(a.completed_date) -
        new Date(b.completed_date)
    );

    const report =
        generateAnnualReport(
            currentYear,
            data.books
        );

    const goal =
        data.readingGoal?.books_goal || 0;

    const percent =
        goal
            ? Math.min(
                100,
                Math.round(
                    report.booksRead / goal * 100
                )
            )
            : 0;

    return `

<section class="profile-section">

    <h2>

        🎯 ${currentYear} Reading Challenge

    </h2>

    <div class="goal-card">

        <div class="goal-progress">

            <div
                class="goal-progress-fill"
                style="width:${percent}%">

            </div>

        </div>

        <p>

            ${report.booksRead}
            of
            ${goal}
            books

        </p>

    </div>

</section>

<section class="profile-section">

    <h3>
        📚 Books Read in ${year}
    </h3>

    <div class="friend-reading-book-grid">

        ${booksRead.map(book => `

            ${renderFriendGoalBook(book)}

        `).join("")}

    </div>

</section>

`;

}

function renderFriendGoalBook(book) {

    return `

    <div class="friend-goal-book-card">

        <img
            src="${book.cover || ""}"
            class="friend-goal-cover"
        >

        <h4>
            ${book.title}
        </h4>

        <p>
            ${book.author || ""}
        </p>

        <p>
            Finished
            <br>
            ${formatHistoryDate(book.completed_date)}
        </p>

        ${book.rating
            ?
            `<p>
                ⭐ ${book.rating}/5
            </p>`
            :
            ""
        }

    </div>

    `;
}

function renderProfileHeader(profile) {

    return `

        <section class="profile-header">

            <img
                src="${profile.avatar_url || ""}"
                class="profile-avatar">

            <h2>

                ${profile.display_name ||
        profile.username}

            </h2>

            <p>

                @${profile.username}

            </p>

            <p class="profile-bio">

                ${profile.bio ||
        "No bio yet."}

            </p>            

        </section>

    `;

}

function renderProfileTabs() {

    return `

        <div class="profile-tabs">

            <button
                class="profile-tab ${currentFriendProfileTab === "profile" ? "active" : ""}"
                onclick="switchFriendProfileTab('profile')">

                Profile

            </button>

            <button
                class="profile-tab ${currentFriendProfileTab === "goals" ? "active" : ""}"
                onclick="switchFriendProfileTab('goals')">

                Reading Goals

            </button>

        </div>

    `;

}

function renderCurrentReadingSection(books) {

    const currentlyReading =
        books.filter(book =>
            book.status === "Reading"
        );

    return `

<section class="profile-section">

    <h3>

        📖 Currently Reading

    </h3>

    <div class="current-reading-grid">

        ${currentlyReading.map(book => `

            <div class="current-book-card">

    <img
        src="${book.cover || ""}"
        class="current-book-cover">

    <h4>

        ${book.title}

    </h4>

    <p>

        ${book.author || ""}

    </p>

</div>

        `).join("")}

    </div>

</section>

`;

}
function renderReadingStatsSection(snapshot) {

    return `

        <section class="profile-section">

            <h3>

                📈 Reading Snapshot

            </h3>

            <div class="reading-snapshot-grid">

                <div class="snapshot-card">
                    <h2>
                        ${snapshot.booksRead}
                    </h2>
                    <p>
                        Books Read
                    </p>
                </div>

                <div class="snapshot-card">
                    <h2>
                        ${snapshot.pagesRead.toLocaleString()}
                    </h2>
                    <p>
                        Pages Read
                    </p>
                </div>

                <div class="snapshot-card">
                     <h2>
                        ⭐ ${snapshot.averageRating}
                     </h2>
                    <p>
                         Average Rating
                    </p>
                </div>

                <div class="snapshot-card">
                    <h2>
                        ✍️
                    </h2>
                    <p>
                        ${snapshot.topAuthor}
                    </p>
                    <small>
                        Most Read Author
                    </small>
                </div>

                <div class="snapshot-card">
                    <h2>
                        📚
                    </h2>
                    <p>
                        ${snapshot.topGenre}
                    </p>
                    <small>
                        Top Genre
                    </small>
                </div>

            </div>

        </section>

    `;

}

function renderRecentActivitySection(activities) {

    if (!activities.length) {

        return `

        <section class="profile-section">

            <h3>
                🕒 Recent Reading Activity
            </h3>

            <p>
                No recent activity yet.
            </p>

        </section>

        `;
    }

    return `

<section class="profile-section">
    <h3>
        🕒 Recent Reading Activity
    </h3>

    <div class="recent-activity-list">

        ${activities.map(activity => `

            <div class="activity-card">

                <div class="activity-icon">
                    ${getActivityIcon(activity.type)}
                </div>

                <div class="activity-info">

                    <h4>
                        ${activity.title}
                    </h4>

                    <p>
                        ${activity.author || ""}
                    </p>

                    <p>
                        ${getActivityText(activity)}
                    </p>

                    <small>
                        ${formatHistoryDate(activity.date)}
                    </small>

                </div>

            </div>

        `).join("")}

    </div>

</section>

`;

}
function renderReadingHistorySection(history) {

    if (!history.length) {

        return `

        <section class="profile-section">

            <h3>
                📚 Reading History
            </h3>

            <p>
                No completed books yet.
            </p>

        </section>

        `;

    }


    return `

<section class="profile-section">

    <h3>
        📚 Reading History
    </h3>


    <div class="reading-history-list">


        ${history.map(book => `


            <div class="history-book-card">


                <img
                    src="${book.cover || ""}"
                    class="history-book-cover">


                <div class="history-book-info">


                    <h4>
                        ${book.title}
                    </h4>


                    <p>
                        ${book.author || ""}
                    </p>


                    <p>
                        Finished 
                        ${formatHistoryDate(
        book.completed_date
    )}
                    </p>


                    ${book.rating
            ?
            `<p>
                            ⭐ ${book.rating}/5
                        </p>`
            :
            ""
        }


                </div>


            </div>


        `).join("")}


    </div>


</section>

`;

}

const defaultAvatars = {

    Books: [
        "images/avatars/book-stack.png",
        "images/avatars/floral-book.jpg",
        "images/avatars/open-book.jpg",
        "images/avatars/key-book.jpg",
    ],

    Fantasy: [
        "images/avatars/fantasy-era.jpg",
        "images/avatars/sword-book.jpg",
        "images/avatars/dragon.jpg",
        "images/avatars/magic-owl.jpg",
    ],

    Mystery: [
        "images/avatars/ghost.jpg",
        
    ],

    Cozy: [
        "images/avatars/romantic-letter.png",
        "images/avatars/geese.jpg",
        "images/avatars/cozy-girl.jpg", 
        "images/avatars/fairytales.jpg"
    ]

};

document
    .getElementById(
        "chooseDefaultAvatarBtn"
    )
    .onclick =
    openAvatarPicker;

function openAvatarPicker() {

    const grid =
        document.getElementById(
            "avatarGrid"
        );

    grid.innerHTML =
        Object.values(defaultAvatars)
    .flat()
    .map(path => `

        <img
            src="${path}"
            class="default-avatar"
            onclick="selectDefaultAvatar('${path}')">

    `)
    .join("");

    document
        .getElementById(
            "avatarPickerModal"
        )
        .classList
        .remove("modal-hidden");

}

async function selectDefaultAvatar(path) {

    const {
        data: { user }
    } =
        await supabaseClient
            .auth
            .getUser();

    await supabaseClient
        .from("profiles")
        .update({

            avatar_url: path

        })
        .eq(
            "id",
            user.id
        );

    document
        .getElementById(
            "accountAvatar"
        )
        .src = path;

    closeAvatarPicker();

}

function closeAvatarPicker() {

    document
        .getElementById(
            "avatarPickerModal"
        )
        .classList
        .add("modal-hidden");

}

// ========================
// BOOK DATA
// ========================
function renderTags(book) {

    return (book.tags || [])
        .map(tag => `

            <span
                class="book-tag"
                data-tag="${tag}"
            >
                ${tag}
            </span>

        `)
        .join("");

}

function startReadingSession(book) {

    book.reading_history ??= [];

    const active =
        book.reading_history.find(session => !session.endDate);

    if (active) return;

    book.reading_history.push({

        startDate:
            new Date()
                .toISOString()
                .split("T")[0],

        endDate: ""

    });

}

function finishReadingSession(book) {

    if (!book.reading_history?.length)
        return;

    const active =
        [...book.reading_history]
            .reverse()
            .find(session => !session.endDate);

    if (!active)
        return;

    active.endDate =
        new Date()
            .toISOString()
            .split("T")[0];

}

function getGenreColor(genre) {

    const colors = {

        "Fantasy": "#7E57C2",
        "Historical Fiction": "#66BB6A",
        "Mystery": "#42A5F5",
        "Thriller": "#EF5350",
        "Romance": "#EC407A",
        "Science Fiction": "#26C6DA",
        "Classic": "#FFA726",
        "Classics": "#FFA726",
        "Nonfiction": "#8D6E63",
        "Biography": "#8D6E63",
        "Children": "#FFEE58",
        "Young Adult": "#AB47BC"

    };

    return colors[genre] || "#BDBDBD";

}

function groupBooksByMonth(books) {

    const months = Array.from({ length: 12 }, () => []);

    books.forEach(book => {

        if (!book.completed_date) return;

        const month =
            new Date(book.completed_date).getMonth();

        months[month].push(book);

    });

    return months;

}

let currentReadingGoal = null;

async function loadReadingGoal(year) {

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        console.error("No authenticated user.");
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("reading_goals")
            .select("*")
            .eq("user_id", user.id)
            .eq("year", year)
            .maybeSingle();

    if (error) {
        console.error(error);
        return;
    }

    currentReadingGoal = data;

    console.log(
        "Loaded goal:",
        currentReadingGoal
    );
}

async function fetchPageCount(isbn, title, author) {

    let query = "";

    if (isbn) {
        query = `isbn:${isbn}`;
    } else {
        query = `${title} ${author}`;
    }

    const url =
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        const book = data.items?.[0];

        return book?.volumeInfo?.pageCount || null;

    } catch (err) {
        console.error("Page fetch failed", err);
        return null;
    }
}

function getReadingDays(book) {

    if (!book.reading_history?.length)
        return null;

    const first =
        book.reading_history[0].startDate;

    const last =
        book.reading_history.at(-1).endDate;

    if (!first || !last)
        return null;

    return Math.ceil(

        (new Date(last) - new Date(first))

        / 86400000

    );

}
function renderAnnualReport() {

    const year =
        Number(
            document.getElementById("reportYear").value
        );

    const report =
        generateAnnualReport(year);

    const container =
        document.getElementById(
            "annualReportContent"
        );

    const goal =
        currentReadingGoal?.books_goal || 0;

    if (!container) return;

    container.innerHTML =
        renderAnnualReportHTML(report);
}

function renderAnnualReportBook(book, report) {

    const ratingBadge =
        book.rating !== null &&
            book.rating !== undefined &&
            book.rating !== ""
            ? `
                <div class="report-rating-badge">
                    ⭐${book.rating}
                </div>
            `
            : "";

    const ratingText =
        book.rating !== null &&
            book.rating !== undefined &&
            book.rating !== ""
            ? `${book.rating}/5`
            : "Unrated";

    return `

<div class="report-book">

    <div class="report-book-number">
        #${report.books.indexOf(book) + 1}
    </div>

    <div class="report-cover-wrapper">

        ${ratingBadge}

        <img
            src="${book.cover || ""}"
            class="report-cover"
            title="${book.title}"
            style="border:4px solid ${getGenreColor(book.genre)};"
        >

    </div>

    <div class="report-finish-date">
        ${formatShortDate(book.completed_date)}
    </div>

    <div class="report-tooltip">

        <h4>${book.title}</h4>

        <p>${book.author}</p>

        <hr>

        <p>${book.genre || "Unknown Genre"}</p>

        <p>${book.page_count || "?"} pages</p>

        <p>
            Finished
            <br>
            ${new Date(book.completed_date).toLocaleDateString()}
        </p>

        <p>
            Rating
            <br>
            ${ratingText}
        </p>

        <p>
            Tags
            <br>
            <div class="book-tags">
                ${renderTags(book)}
            </div>
        </p>

        <p>
            Reading Time
            <br>
            ${getReadingDays(book)
            ? `${getReadingDays(book)} days`
            : "Unknown"
        }
        </p>

    </div>

</div>

`;
}

function renderAnnualReportHTML(report) {
    const booksRead =
        getBooksReadForYear(report.year);

    const goal =
        currentReadingGoal?.books_goal || 0;

    const percent =
        goal
            ? Math.round(
                booksRead / goal * 100
            )
            : 0;

    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];

    const months = groupBooksByMonth(report.books);

    const monthHTML = months.map((books, monthIndex) => {

        if (!books.length) return "";

        const covers = books
            .map(book =>
                renderAnnualReportBook(book, report)
            )
            .join("");

        return `

        <section class="report-month">

            <h3>
                ${monthNames[monthIndex]}
                (${books.length})
            </h3>

            <div class="report-cover-grid">

                ${covers}

            </div>

        </section>

    `;

    }).join("");

    return `

        <div class="report-grid">

            <div class="report-card">
                <h2>${report.booksRead}</h2>
                <p>Books Read</p>
            </div>

            <div class="report-card">
                <h2>${report.pagesRead}</h2>
                <p>Pages Read</p>
            </div>

            <div class="report-card">
                <h2>${report.daysRead}</h2>
                <p>Days Read</p>
            </div>

            <div class="report-card">
                <h2>${report.currentStreak}</h2>
                <p>Current Streak</p>
            </div>

        </div>

        <h2>Reading Highlights</h2>

        <p>
            <strong>Favorite Genre:</strong>
            ${report.topGenre}
        </p>

        <p>
            <strong>Most Read Author:</strong>
            ${report.topAuthor}
        </p>

        <p>
            <strong>Average Rating:</strong>
            ${report.averageRating}
        </p>

        <div class="goal-card">

    <h3>Reading Goal</h3>

    <div class="goal-progress">

        <div
            class="goal-progress-fill"
            style="width:${Math.min(percent, 100)}%">
        </div>

    </div>

    <p>
        <div class="goal-edit-row">

    <input
        type="number"
        id="booksGoalInput"
        value="${goal}"
        min="1"
    >

    <button
        onclick="saveReadingGoal(${report.year})"
    >
        Save Goal
    </button>

</div>

<p>
    ${booksRead} of ${goal} books
</p>
    </p>

</div>

        <h2>Books Finished</h2>

${monthHTML}
    `;
}

function openAnnualReport() {

    const year =
        new Date().getFullYear();

    const report =
        generateAnnualReport(year);

    openStatsModal(
        `📚 ${year} Reading Report`,
        renderAnnualReportHTML(report)
    );
}

function generateAnnualReport(year, books = myLibrary) {

    const completedBooks =
        books
            .filter(book => {
                if (!book.completed_date) return false;

                return (
                    new Date(book.completed_date)
                        .getFullYear() === year
                );
            })
            .sort((a, b) =>
                new Date(a.completed_date) -
                new Date(b.completed_date)
            );

    return {

        year,

        booksRead: completedBooks.length,

        pagesRead: completedBooks.reduce(
            (sum, book) =>
                sum + (book.page_count || 0),
            0
        ),

        topGenre: getTopGenre(completedBooks),

        topAuthor: getTopAuthor(completedBooks),

        averageRating: getAverageRating(completedBooks),

        daysRead: getDaysReadThisYear(),

        currentStreak: calculateStreak(true),

        books: completedBooks
    };
}

async function saveReadingGoal(year) {

    const goal =
        Number(
            document.getElementById(
                "booksGoalInput"
            ).value
        );

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        console.error("No authenticated user.");
        return;
    }

    const { error } =
        await supabaseClient
            .from("reading_goals")
            .upsert(
                {
                    user_id: user.id,
                    year,
                    books_goal: goal
                },
                {
                    onConflict: "user_id,year"
                }
            );

    if (error) {
        console.error(error);
        return;
    }

    await loadReadingGoal(year);
    renderAnnualReport();
}

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

        page_count: volume.pageCount || null,

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

function getBooksReadForYear(year) {

    return myLibrary.filter(book =>
        book.completed_date &&
        new Date(book.completed_date).getFullYear() === year
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
function renderBookGrid(books, view = "") {

    return `
        <div class="mini-library-grid">

            ${books.map(book => `

                <div class="mini-book-card">

                    <img src="${book.cover || ""}" alt="${book.title}">

                    <p>${book.title}</p>

                    <small>${book.author || ""}</small>

                   ${view === "currentlyReading" ? `
    <div class="reading-actions">

        <button
            onclick="openFinishBookModal('${book.id}')">
            ✓ Finished
        </button>

        <button
            class="dnf-btn"
            onclick="markDNF('${book.id}')">
            🚫 DNF
        </button>

        <button
            class="feature-reading-btn"
            data-book-id="${book.id}">
            ⭐ Show on Profile
        </button>

    </div>
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

    const history = book.reading_history || [];

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

                book.reading_history.splice(index, 1);

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

                book.reading_history[index] = {
                    startDate,
                    endDate: finishDate
                };

                saveLibrary();

                // refresh visible reading history
                document.getElementById("detailReadingHistory").innerHTML =
                    book.reading_history.length
                        ? book.reading_history.map((r, i) => `
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

    const visibleBooks =
        books.slice(0, visibleBookCount);

    visibleBooks.forEach(book => {

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

    <button
    class="favorite-btn ${book.favorite ? "active" : ""}"
    data-id="${book.id}">
    <span class="material-symbols-outlined">
        bookmark
    </span>
</button>
<div class="library-cover-wrapper">

${book.cover ? `<img src="${book.cover}">` : ""}

       ${book.rating !== null &&
                book.rating !== undefined &&
                book.rating !== ""
                ? (
                    book.rating === 0
                        ? `
                <div class="library-rating-badge dnf-badge">
                    DNF
                </div>
            `
                        : `
                <div class="library-rating-badge">
                    ⭐${book.rating}
                </div>
            `
                )
                : ""
}
            </div>
    

    <h3>${book.title}</h3>
    <p>${book.author}</p>

    <div class="book-tags">
    ${renderTags(book)}
</div>
    

    <button onclick="openBookModal('${book.id}')">
        Details
    </button>
`;

        library.appendChild(card);
    });

    // update shelf label count
    updateShelfLabel(books.length);
    renderLoadMoreButton(books.length);
    renderActiveTagBanner();

    document.querySelectorAll(".favorite-btn")
        .forEach(btn => {

            btn.addEventListener("click", async e => {

                e.stopPropagation();

                const book =
                    findBook(btn.dataset.id);

                if (!book) return;

                book.favorite = !book.favorite;

                const { error } = await supabaseClient
                    .from("books")
                    .update({
                        favorite: book.favorite
                    })
                    .eq("id", book.id);

                if (error) {
                    console.error(error);
                    return;
                }
                renderLibrary();
            });
        });

    document.querySelectorAll(".book-tag")
        .forEach(tag => {

            tag.addEventListener("click", e => {

                e.stopPropagation();

                activeTag = tag.dataset.tag;

                visibleBookCount = BOOKS_PER_PAGE;

                renderLibrary();
                renderStats();
                renderAnnualReport();
                renderCollectionHighlights();
            });

        });
}

function renderLoadMoreButton(totalBooks) {

    const container =
        document.getElementById("loadMoreContainer");

    if (!container) return;

    if (visibleBookCount >= totalBooks) {

        container.innerHTML = "";

        return;

    }

    container.innerHTML = `
        <button id="loadMoreBtn">
            Load More Books
        </button>
    `;

    document
        .getElementById("loadMoreBtn")
        .onclick = () => {

            visibleBookCount += BOOKS_PER_PAGE;

            renderLibrary();

        };

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

        const added = new Date(book.date_Added);

        return (
            added.getMonth() === now.getMonth() &&
            added.getFullYear() === now.getFullYear()
        );
    }).length;
}

function getAverageRating(books = myLibrary) {

    const rated =
        books.filter(b => b.rating > 0);

    if (!rated.length) return "N/A";

    const avg =
        rated.reduce(
            (sum, b) =>
                sum + Number(b.rating),
            0
        ) / rated.length;

    return avg.toFixed(1);
}

function getTopGenre(books = myLibrary) {

    const counts = countBy(books, "genre");

    return getMaxKey(counts, "None");
}

function getTopAuthor(books = myLibrary) {

    const counts = countBy(books, "author");

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
        renderAnnualReport();
        renderCollectionHighlights();
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
function openFinishBookModal(id) {

    finishingBookId = id;
    selectedFinishRating = null;

    const book = findBook(id);

    document.getElementById("finishBookContent").innerHTML = `

        <h2>⭐ You Finished</h2>

        <h3>${book.title}</h3>

        <p>How would you rate it?</p>

        <div class="finish-rating-options">

            <button class="rating-option" data-rating="">
                Unrated
            </button>

            <button class="rating-option" data-rating="1">
                ★☆☆☆☆
            </button>

            <button class="rating-option" data-rating="2">
                ★★☆☆☆
            </button>

            <button class="rating-option" data-rating="3">
                ★★★☆☆
            </button>

            <button class="rating-option" data-rating="4">
                ★★★★☆
            </button>

            <button class="rating-option" data-rating="5">
                ★★★★★
            </button>

        </div>

        <div class="finish-buttons">

            <button onclick="closeFinishBookModal()">
                Skip
            </button>

            <button onclick="finishBookWithRating()">
                Save
            </button>

        </div>

    `;

    document
        .getElementById("finishBookModal")
        .classList.remove("hidden");

    const ratingButtons =
        document.querySelectorAll(
            "#finishBookModal .rating-option"
        );

    ratingButtons.forEach(btn => {

        btn.addEventListener("click", () => {

            ratingButtons.forEach(b =>
                b.classList.remove("selected")
            );

            btn.classList.add("selected");

            selectedFinishRating =
                btn.dataset.rating === ""
                    ? null
                    : Number(btn.dataset.rating);

        });

    });

    const unratedButton =
        document.querySelector(
            '#finishBookModal .rating-option[data-rating=""]'
        );

    unratedButton.classList.add("selected");

}

function closeFinishBookModal() {

    document
        .getElementById("finishBookModal")
        .classList.add("hidden");

}

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

    
    const pills = document.getElementById("detailPills");

    if (pills) {
        pills.innerHTML = `
        ${book.favorite ? `
            <span class="detail-pill favorite-pill">
                🔖 Favorite
            </span>
        ` : ""}

        ${(book.tags || []).map(tag => `
            <span class="detail-pill">
                ${tag}
            </span>
        `).join("")}
    `;
    }   

    setText("detailTitle", book.title);
    setText("detailAuthor", book.author);
    setText("detailSeries", book.series || "");
    setText("detailGenre", book.genre || "");
    setText("detailStatus", book.status);    
    setText("detailRating", book.rating !== null &&
        book.rating !== undefined &&
        book.rating !== ""
        ? `${book.rating}/5`
        : "Unrated");
    setText("detailISBN", book.isbn || "");
    setText("detailShelves", (book.shelves || []).join(", ") || "None");
    
    const history = book.reading_history || [];

    setText(
        "detailReadingHistory",
        history.length
            ? history.map((r, i) =>
                `Reading ${i + 1}: ${r.startDate} → ${r.endDate}`
            ).join("<br>")
            : "No reading history"
    );

    setText("detailNotes", book.notes || "No notes added.");   

    const editSection = document.getElementById("editSection");   

    if (editSection) {
        editSection.style.display = "none";
    }

    const modal = document.getElementById("bookModal");
    modal.classList.remove("modal-hidden");
    modal.classList.add("modal-hidden");

    if (modal) {
        modal.style.display = "flex";
    }

    console.log("8 - modal should now be visible");
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
    console.log("Opening Reading Dashboard...");

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
    console.log("Reading Dashboard opened.");
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

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        console.error("No authenticated user.");
        return;
    }

    const { data, error } = await supabaseClient
        .from("reading_log")
        .upsert(
            {
                user_id: user.id,
                date,
                books: selectedBookIds
            },
            {
                onConflict: "user_id,date",
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

    const search =
        document.getElementById("logSearch");

    if (search) {

        search.value = "";

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
        myLibrary.filter(book =>
            book.status === "Reading"
        );

    const booksToShow = [...readingBooks];

    entry.books.forEach(id => {

        const book = findBook(id);

        if (
            book &&
            !booksToShow.some(b => b.id === book.id)
        ) {

            booksToShow.push(book);

        }

    });

    editor.innerHTML = `
        <h3>Log Books for ${date}</h3>

        <div class="log-columns">

            <!-- CURRENTLY READING -->
            <div>
                <h4Today's Books</h4>

      <div class="log-book-grid">

${booksToShow.length
    ? booksToShow.map(book => `
        <label class="log-book-card">

            <input
                type="checkbox"
                value="${book.id}"
                ${entry.books.includes(book.id) ? "checked" : ""}
            >

            <img
                src="${book.cover || ''}"
                class="log-book-cover"
                alt="${book.title}"
            >

            <span class="selected-badge">✓</span>

        </label>
    `).join("")
    : `<p>Search your library to log books.</p>`
}
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

async function openCurrentlyReadingModal() {
    console.log("OPEN CURRENTLY READING MODAL FIRED");

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
            "currentlyReading"
        )
            : `
                <p class="empty-state">
                    No books currently being read.
                </p>
            `
        }

    `);
    console.log("CURRENTLY READING MODAL OPENED");

    setupCurrentlyReadingSearch();
    await setupFeaturedReadingButtons();
}

async function setupFeaturedReadingButtons() {

    const featuredBookId =
        await getFeaturedReadingBookId();

    document
        .querySelectorAll(".feature-reading-btn")
        .forEach(button => {

            if (
                button.dataset.bookId ===
                featuredBookId
            ) {

                button.textContent =
                    "⭐ Showing on Profile";

            }

            button.addEventListener(
                "click",
                async () => {

                    const bookId =
                        button.dataset.bookId;

                    await setFeaturedReadingBook(bookId);

                    document
                        .querySelectorAll(".feature-reading-btn")
                        .forEach(btn => {

                            btn.textContent =
                                "⭐ Show on Profile";

                        });

                    button.textContent =
                        "⭐ Showing on Profile";

                }
            );

        });
}

async function markDNF(id) {

    const book = findBook(id);

    if (!book) return;

    book.status = "DNF";

    book.rating = 0;

    if (book.reading_history?.length) {

        const last =
            book.reading_history.at(-1);

        if (!last.endDate) {

            last.endDate =
                new Date()
                    .toISOString()
                    .split("T")[0];
        }
    }

    await updateBook(book);

    renderLibrary();
    renderStats();
    renderAnnualReport();

    openCurrentlyReadingModal();
}

async function setupCurrentlyReadingSearch() {

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
     data-id="${book.id}">

                    <img src="${book.cover || ""}">

                    <p>${book.title || "Untitled"}</p>

                    <small>${book.author || "Unknown Author"}</small>

                </div>

            `).join("");

        resultsContainer
            .querySelectorAll(".search-book-card")
            .forEach(card => {

                card.addEventListener("click", async () => {

                    const book = myLibrary.find(
                        b => b.id == card.dataset.id
                    );

                    if (book) {

                        startReadingSession(book);

                        book.status = "Reading";

                        await saveLibrary();

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
            color: shelfColor,
            user_id: currentUser.id
        });

    if (error) {

        console.error(
            "Shelf insert failed:",
            error
        );

        return;
    }


    shelves.push({
        name: shelfName,
        color: shelfColor
    });


    input.value = "";

    await loadShelves();

    renderShelfNav();
    renderManualShelfCheckboxes();
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
}

async function removeBook(id) {

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
    renderAnnualReport();
    renderCollectionHighlights();
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
        user_id: currentUser.id,
        title: bookData.title,
        author: bookData.author,
        genre: bookData.genre,
        series: bookData.series,
        cover,
        isbn: bookData.isbn,

        page_count: bookData.page_count || null,

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
    await loadShelves();
    await loadReadingGoal(
        new Date().getFullYear()
    );
    renderApp();
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
        user_id: currentUser.id,
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
    renderAnnualReport();
    renderCollectionHighlights();
}

async function saveEditedBook() {

    const book = findBook(currentEditId);
    if (!book) return;
    const oldStatus = book.status;
    const newStatus = editStatus.value;

    if (
        newStatus === "Reading" &&
        book.status !== "Reading"
    ) {

        startReadingSession(book);

    }

    if (
        newStatus === "Finished" &&
        book.status !== "Finished"
    ) {

        finishReadingSession(book);

        if (!book.completed_date) {

            book.completed_date =
                new Date()
                    .toISOString()
                    .split("T")[0];

        }

    }

    book.status = newStatus;

    let completedDate = book.completed_date || null;

    // If user just marked as Finished
    if (oldStatus !== "Finished" && newStatus === "Finished") {
        completedDate = new Date().toISOString().split("T")[0];
    }

    // Optional: if user UN-finishes a book
    if (oldStatus === "Finished" && newStatus !== "Finished") {
        completedDate = null;
    }

    const updatedBook = {
        cover: editCoverInput.value.trim() || book.cover,
        title: editTitle.value,
        author: editAuthor.value,
        series: editSeries.value,
        genre: editGenre.value,
        rating: editRating.value ? Number(editRating.value) : null,
        page_count:
            Number(
                document.getElementById("editPageCount").value
            ) || null,
        isbn: editISBN.value,

        status: newStatus,
        completed_date:
            document.getElementById("editCompletedDate").value || null,

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
    await loadShelves();
    await loadReadingGoal(
        new Date().getFullYear()
    );
    renderApp();

    document.getElementById("bookModal").style.display = "none";
    currentEditId = null;
}

// ------------------------
// READING STATUS ACTIONS
// ------------------------

async function markFinished(id, rating = null) {

    const book = findBook(id);
    if (!book) return;

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    book.status = "Finished";

    book.rating = rating;

    book.completed_date = today;

    book.reading_history ??= [];

    const activeSession =
        [...book.reading_history]
            .reverse()
            .find(session => !session.endDate);

    if (activeSession) {

        activeSession.endDate = today;

    } else {

        // Book somehow never had a reading session.
        // Create one so the history stays complete.

        book.reading_history.push({

            startDate: today,
            endDate: today

        });

    }

    await updateBook(book);

    renderLibrary();
    renderStats();
    renderAnnualReport();
    renderCollectionHighlights();
    openCurrentlyReadingModal();

}

async function finishBookWithRating() {

    closeFinishBookModal();

    await markFinished(
        finishingBookId,
        selectedFinishRating
    );

}

function addReadingSession(id, startDate, endDate) {
    const book = findBook(id);
    if (!book) return;

    book.reading_history ??= [];
    book.reading_history.push({ startDate, endDate });

    saveLibrary();
    renderLibrary();
    renderStats();
    renderAnnualReport();
    renderCollectionHighlights();
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
    document.getElementById("editPageCount").value =
        book.page_count || "";
    editRating.value = book.rating || "";
    editStatus.value = book.status || "Unread";
    document.getElementById("editCompletedDate").value =
        book.completed_date || "";
    editNotes.value = book.notes || "";

    book.reading_history ??= [];

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
    renderAnnualReport();
    renderLibrary();
    renderStats();
    renderCollectionHighlights();
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
function renderActiveTagBanner() {

    const banner =
        document.getElementById("activeTagBanner");

    if (!banner) return;

    if (!activeTag) {
        banner.innerHTML = "";
        return;
    }

    banner.innerHTML = `
        <div class="active-tag-pill">
            🏷️ ${activeTag}
            <button onclick="clearActiveTag()">✕</button>
        </div>
    `;
}

function clearActiveTag() {

    activeTag = null;

    renderLibrary();
    renderStats();
    renderAnnualReport();
    renderCollectionHighlights();
    renderActiveTagBanner();
}

function getFilteredBooks() {

    let books = [...myLibrary];

    // ------------------------
    // 1. STAT FILTER
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
    // 3. TAG FILTER
    // ------------------------
    if (activeTag) {

        books = books.filter(book =>
            (book.tags || []).includes(activeTag)
        );
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

document.addEventListener("DOMContentLoaded", async () => {

    
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
    // FRIENDS
    // ========================
    document
        .getElementById("toggleFriendsBtn")
        ?.addEventListener("click", () => {

            const list =
                document.getElementById("friendsList");

            const arrow =
                document.getElementById("friendsArrow");


            list.classList.toggle("open");


            arrow.textContent =
                list.classList.contains("open")
                    ? "▲"
                    : "▼";

        });

    document
        .getElementById("addFriendBtn")
        ?.addEventListener(
            "click",
            openFriendModal
    );

    document
        .getElementById("searchFriendBtn")
        ?.addEventListener(
            "click",
            searchFriends
        );

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
        for (const book of myLibrary) {

            if (!book.shelves?.includes(editingShelf.name))
                continue;

            const updatedShelves =
                book.shelves.map(s =>
                    s === editingShelf.name
                        ? newName
                        : s
                );

            book.shelves = updatedShelves;

            await supabaseClient
                .from("books")
                .update({
                    shelves: updatedShelves
                })
                .eq("id", book.id);
        }

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

        if (!book.reading_history) {
            book.reading_history = [];
        }

        book.reading_history.push({
            startDate: "",
            endDate: ""
        });
        console.log("ADD SESSION CLICKED");
        renderReadingHistory(book);
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

        document
            .getElementById("habitModal")
            .classList.remove("hidden");
    });

    closeHabitBtn?.addEventListener("click", () => {
        document
            .getElementById("habitModal")
            .classList.add("hidden");
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
        renderAnnualReport();
        renderCollectionHighlights();
    });

    filterSort?.addEventListener("change", () => {
        renderLibrary();
        renderStats();
        renderAnnualReport();
        renderCollectionHighlights();
    });
});

window.removeBook = removeBook;
window.confirmRemoveBook = confirmRemoveBook;
window.markFinished = markFinished;