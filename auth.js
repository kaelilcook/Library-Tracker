// JavaScript source code
let currentUser = null;
let currentProfile = null;

async function signUp() {
    console.log("Sign up clicked");

    const email =
        document
            .getElementById("signupEmail")
            .value
            .trim();


    const username =
        document
            .getElementById("signupUsername")
            .value
            .trim();


    const password =
        document
            .getElementById("signupPassword")
            .value;


    const confirmPassword =
        document
            .getElementById("signupConfirmPassword")
            .value;


    if (password !== confirmPassword) {

        alert(
            "Passwords do not match."
        );

        return;
    }


    const { data, error } =
        await supabaseClient.auth.signUp({

            email,
            password,

            options: {

                emailRedirectTo:
                    "https://kaelilcook.github.io/Library-Tracker/",

                data: {
                    username
                }

            }

        });


    if (error) {

        alert(error.message);
        return;

    }


    alert(
        "Account created! Check your email."
    );

}

document
    .getElementById("submitSignupBtn")
    .addEventListener(
        "click",
        signUp
    );

document
    .getElementById("signupBtn")
    .addEventListener("click", () => {

        console.log("Create Account clicked");

        openSignupModal();

    });

function openSignupModal() {

    console.log("Opening signup modal");

    document
        .getElementById("signupModal")
        .classList
        .remove("modal-hidden");
}


function closeSignupModal() {

    document
        .getElementById("signupModal")
        .classList
        .add("modal-hidden");

}

async function login() {

    const email =
        document.getElementById("email").value;

    const password =
        document.getElementById("password").value;

    const { error } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        alert(error.message);
    }
}

function setupPasswordToggle(inputId, buttonId) {

    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);

    const icon = button.querySelector("i");

    button.addEventListener("click", () => {

        if (input.type === "password") {

            input.type = "text";

            icon.classList.remove("bi-eye");
            icon.classList.add("bi-eye-slash");

        } else {

            input.type = "password";

            icon.classList.remove("bi-eye-slash");
            icon.classList.add("bi-eye");

        }

    });

}

setupPasswordToggle("password", "togglePasswordBtn");

async function resetPasswordRequest() {

    const email =
        document
            .getElementById("email")
            .value
            .trim();

    console.log("Sending reset email to:", email);

    if (!email) {
        alert("Please enter your email first.");
        return;
    }


    const { error } =
        await supabaseClient.auth.resetPasswordForEmail(
            email,
            {
                redirectTo:
                    "https://kaelilcook.github.io/Library-Tracker/reset-password.html"
            }
        );


    if (error) {

        console.error(
            "Reset error:",
            error
        );

        alert(error.message);

        return;
    }


    alert(
        "Password reset email sent."
    );
}

document
    .getElementById("forgotPasswordBtn")
    ?.addEventListener(
        "click",
        resetPasswordRequest
    );

function openForgotPasswordModal() {
    document
        .getElementById("forgotPasswordBtn")
        .addEventListener(
            "click",
            () => {

                console.log(
                    "Forgot password clicked"
                );

            }
        );

    document
        .getElementById("forgotPasswordModal")
        .classList.remove("modal-hidden");

}

function closeForgotPasswordModal() {

    document
        .getElementById("forgotPasswordModal")
        .classList.add("modal-hidden");

}

async function sendPasswordReset() {

    const email =
        document
            .getElementById("resetEmail")
            .value
            .trim();

    if (!email) {

        alert("Please enter your email.");

        return;

    }

    const { error } =
        await supabaseClient.auth.resetPasswordForEmail(
            email,
            {
                redirectTo:
                    window.location.origin +
                    "/reset-password.html"
            }
        );

    if (error) {

        alert(error.message);

        return;

    }

    alert(
        "If an account exists for that email, a password reset link has been sent."
    );

    closeForgotPasswordModal();

}

async function ensureProfileExists() {

    const { data: profile } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();


    if (!profile) {

        await supabaseClient
            .from("profiles")
            .insert({

                id: currentUser.id,

                username:
                    currentUser.email
                        .split("@")[0],

                display_name:
                    "",

                friend_code:
                    generateFriendCode()
            });
    }

    const { data: privateProfile } =
        await supabaseClient
            .from("private_profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

    if (!privateProfile) {

        await supabaseClient
            .from("private_profiles")
            .insert({
                id: currentUser.id,
                email:
                    currentUser.email
            });
    }
}
function generateFriendCode() {

    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let code = "";

    for (let i = 0; i < 8; i++) {

        code += chars[
            Math.floor(
                Math.random() * chars.length
            )
        ];
    }
    return code;
}

async function openAccountModal() {

    console.log("Opening account modal");


    const { data: profile, error } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single();

    if (error) {
        console.error(
            "Profile load error:",
            error
        );
        return;
    }

    const { data: privateProfile, error: privateError } =
        await supabaseClient
            .from("private_profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single();


    if (privateError) {
        console.error(
            "Private profile load error:",
            privateError
        );
        return;
    }

    document.getElementById("accountUsername").value =
        profile.username || "";

    document.getElementById("accountDisplayName").value =
        profile.display_name || "";

    document.getElementById("accountFriendCode").value =
        profile.friend_code || "";

    document.getElementById("accountEmail").value =
        privateProfile.email || "";

    document.getElementById("accountAvatar").src =
        profile.avatar_url || "";

    document
        .getElementById("accountModal")
        .classList
        .remove("modal-hidden");
    }

async function saveAccount() {

    const username =
        document
            .getElementById("accountUsername")
            .value
            .trim();

    const displayName =
        document
            .getElementById("accountDisplayName")
            .value
            .trim();

    const { error } =
        await supabaseClient
            .from("profiles")
            .update({
                username: username,
                display_name: displayName,
                updated_at: new Date()
            })
            .eq(
                "id",
                currentUser.id
            );

    if (error) {

        console.error(
            "Profile update failed:",
            error
        );
        alert(error.message);
        return;
    }
    console.log(
        "Profile updated"
    );

    closeAccountModal();
}

function closeAccountModal() {

    document
        .getElementById("accountModal")
        .classList
        .add("modal-hidden");
}

document
    .getElementById("loginBtn")
    .addEventListener("click", login);

supabaseClient.auth.onAuthStateChange(

    async (event, session) => {

        if (session) {

            currentUser = session.user;

            document
                .getElementById("authScreen")
                .classList
                .add("hidden");

            document
                .getElementById("app")
                .classList
                .remove("hidden");

            await initializeApp();

        } else {

            currentUser = null;

            document
                .getElementById("authScreen")
                .classList
                .remove("hidden");

            document
                .getElementById("app")
                .classList
                .add("hidden");
        }
    }
);

async function loadProfile() {

    if (!currentUser) {
        console.error("No current user.");
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single();


    if (error) {
        console.error(
            "Profile load error:",
            error
        );
        return;
    }


    currentProfile = data;

    console.log(
        "Loaded profile:",
        currentProfile
    );
}

document
    .getElementById("logoutBtn")
    .addEventListener(

        "click",

        async () => {
            await supabaseClient.auth.signOut();
        }
);

document
    .getElementById("accountBtn")
    .addEventListener("click", openAccountModal);

document
    .getElementById("saveAccountBtn")
    .addEventListener(
        "click",
        saveAccount
    );