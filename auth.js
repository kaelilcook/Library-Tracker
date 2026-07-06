// JavaScript source code
async function signUp() {

    const email =
        document
            .getElementById("email")
            .value;

    const password =
        document
            .getElementById("password")
            .value;

    const { error } =
        await supabaseClient.auth.signUp({
            email,
            password
        });
    if (error) {
        alert(error.message);
        return;
    }
    alert("Account created!");
}

document
    .getElementById("signupBtn")
    .addEventListener("click", signUp);

async function login() {

    const email =
        document
            .getElementById("email")
            .value;

    const password =
        document
            .getElementById("password")
            .value;

    const { error } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {

        alert(error.message);
        return;
    }
}

document
    .getElementById("loginBtn")
    .addEventListener("click", login);

supabaseClient.auth.onAuthStateChange(

    async (event, session) => {

        if (session) {
            document
                .getElementById("authScreen")
                .classList.add("hidden");

            document
                .getElementById("app")
                .classList.remove("hidden");

            await loadLibrary();
        }

        else {
            document
                .getElementById("authScreen")
                .classList.remove("hidden");

            document
                .getElementById("app")
                .classList.add("hidden");
        }
    }
);

document
    .getElementById("logoutBtn")
    .addEventListener(

        "click",

        async () => {
            await supabaseClient.auth.signOut();
        }
    );