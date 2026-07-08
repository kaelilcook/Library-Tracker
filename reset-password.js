// JavaScript source code
const savePasswordBtn =
    document.getElementById("savePasswordBtn");


savePasswordBtn?.addEventListener(
    "click",
    savePassword
);

async function savePassword() {

    const password =
        document
            .getElementById("newPassword")
            .value;

    const confirmPassword =
        document
            .getElementById("confirmPassword")
            .value;

    if (password !== confirmPassword) {

        alert(
            "Passwords do not match."
        );

        return;

    }

    if (password.length < 6) {

        alert(
            "Password must be at least 6 characters."
        );

        return;

    }

    const { error } =
        await supabaseClient.auth.updateUser({

            password: password

        });

    if (error) {

        console.error(
            "Password update error:",
            error
        );

        alert(
            error.message
        );

        return;

    }

    alert(
        "Password updated successfully!"
    );

    window.location.href = "index.html";
}