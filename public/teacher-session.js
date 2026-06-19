(function(){
  const guidancePage = ["/guidance", "/guidance.html", "/guidance-offline-shell", "/guidance-report", "/guidance-report.html", "/guidance-report-offline-shell"].includes(window.location.pathname);
  const canonicalPage = {
    "/guidance.html":"/guidance",
    "/students-offline-shell":"/students",
    "/personnel-offline-shell":"/personnel",
    "/personnel-profile-offline-shell":"/personnel-profile",
    "/student-dashboard-offline-shell":"/student-dashboard",
    "/guidance-offline-shell":"/guidance",
    "/guidance-report.html":"/guidance-report",
    "/guidance-report-offline-shell":"/guidance-report",
    "/teacher-accounts-offline-shell":"/teacher-accounts"
  }[window.location.pathname] || window.location.pathname;
  const protectedPage = document.body.matches(".teacher-accounts-page")
    || ["/students", "/students.html", "/students-offline-shell", "/personnel", "/personnel.html", "/personnel-offline-shell", "/personnel-profile", "/personnel-profile.html", "/personnel-profile-offline-shell", "/student-dashboard", "/student-dashboard.html", "/student-dashboard-offline-shell", "/guidance", "/guidance.html", "/guidance-offline-shell", "/guidance-report", "/guidance-report.html", "/guidance-report-offline-shell", "/teacher-accounts", "/teacher-accounts.html", "/teacher-accounts-offline-shell"]
      .includes(window.location.pathname);
  const privacyAgreementKey = "bakhawDataPrivacyNoticeAgreed";
  const localEntryAllowed = (
    Boolean(window.LearnerOffline?.hasOfflineSession())
    && (!guidancePage || Boolean(window.LearnerOffline?.hasGuidanceSession()))
  );
  window.teacherEntryAllowed = !protectedPage || localEntryAllowed;

  if(protectedPage){
    window.LearnerOffline?.registerServiceWorker?.().catch(()=>{});
  }

  if(!window.teacherEntryAllowed){
    window.LearnerOffline?.clearOfflineSession();
    const nextPage = canonicalPage + window.location.search;
    window.location.replace(`/login?next=${encodeURIComponent(nextPage)}`);
    window.stop();
    return;
  }

  if(protectedPage && !localEntryAllowed && navigator.onLine){
    fetch("/api/teacher-session", { cache:"no-store" })
      .then(response=>response.ok ? response.json() : null)
      .then(session=>{
        if(!session?.ok || (guidancePage && !session.guidanceAccess)){
          return;
        }
        window.LearnerOffline?.setOfflineSession(true);
        if(session.guidanceAccess){
          window.LearnerOffline?.setGuidanceSession(true);
        }
      })
      .catch(()=>{});
  }

  function logout(){
    if(window.LearnerOffline){
      LearnerOffline.clearOfflineSession();
    }
    try{
      if(navigator.onLine){
        if(navigator.sendBeacon){
          navigator.sendBeacon("/api/teacher-logout");
        }else{
          fetch("/api/teacher-logout", { method:"POST", keepalive:true }).catch(()=>{});
        }
      }
    }finally{
      window.location.replace("/login");
    }
  }

  function pinInput(id, label, autocomplete){
    return `
      <label class="teacher-pin-field" for="${id}">
        <span>${label}</span>
        <input id="${id}" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
          autocomplete="${autocomplete}" placeholder="4 digits" required>
      </label>`;
  }

  function createResetPinDialog(){
    const dialog = document.createElement("dialog");
    dialog.className = "teacher-pin-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="teacher-pin-form">
        <div class="teacher-pin-heading">
          <div>
            <p>Account security</p>
            <h2>Reset Your PIN</h2>
          </div>
          <button class="teacher-pin-close" type="button" aria-label="Close">x</button>
        </div>
        <p class="teacher-pin-intro">Enter your current PIN, then choose a new 4-digit PIN.</p>
        ${pinInput("teacherCurrentPin", "Current PIN", "current-password")}
        ${pinInput("teacherNewPin", "New PIN", "new-password")}
        ${pinInput("teacherConfirmPin", "Confirm New PIN", "new-password")}
        <p class="teacher-pin-status" role="status"></p>
        <div class="teacher-pin-actions">
          <button class="teacher-pin-cancel" type="button">Cancel</button>
          <button class="teacher-pin-save" type="submit">Save New PIN</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function createPrivacyDialog(){
    const dialog = document.createElement("dialog");
    dialog.className = "teacher-privacy-dialog";
    dialog.innerHTML = `
      <div class="teacher-privacy-icon" aria-hidden="true">!</div>
      <h2>Data Privacy Notice</h2>
      <p>This app is protected by the Data Privacy Act of 2012. Hence, you are required to keep the data security in full confidentiality.</p>
      <p class="teacher-privacy-question">Do you agree?</p>
      <div class="teacher-privacy-actions">
        <button class="teacher-privacy-disagree" type="button">Disagree</button>
        <button class="teacher-privacy-agree" type="button">Agree</button>
      </div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function showPrivacyNoticeIfNeeded(){
    if(!protectedPage || sessionStorage.getItem(privacyAgreementKey) === "yes"){
      document.documentElement.classList.remove("teacher-privacy-pending");
      return;
    }
    const dialog = createPrivacyDialog();
    const agreeButton = dialog.querySelector(".teacher-privacy-agree");
    const disagreeButton = dialog.querySelector(".teacher-privacy-disagree");
    dialog.addEventListener("cancel", event=>event.preventDefault());
    agreeButton.addEventListener("click", async ()=>{
      agreeButton.disabled = true;
      disagreeButton.disabled = true;
      agreeButton.textContent = "Continuing...";
      try{
        sessionStorage.setItem(privacyAgreementKey, "yes");
        if(navigator.onLine){
          await fetch("/api/teacher-consent", { method:"POST" }).catch(()=>{});
        }
        document.documentElement.classList.remove("teacher-privacy-pending");
        dialog.close();
      }finally{
        agreeButton.disabled = false;
        disagreeButton.disabled = false;
        agreeButton.textContent = "Agree";
      }
    });
    disagreeButton.addEventListener("click", ()=>{
      sessionStorage.removeItem(privacyAgreementKey);
      logout();
    });
    dialog.showModal();
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    showPrivacyNoticeIfNeeded();
    const resetDialog = createResetPinDialog();
    const resetForm = resetDialog.querySelector("form");
    const status = resetDialog.querySelector(".teacher-pin-status");
    const currentPin = resetDialog.querySelector("#teacherCurrentPin");
    const newPin = resetDialog.querySelector("#teacherNewPin");
    const confirmPin = resetDialog.querySelector("#teacherConfirmPin");
    const saveButton = resetDialog.querySelector(".teacher-pin-save");

    function closeResetDialog(){
      resetDialog.close();
      resetForm.reset();
      status.textContent = "";
    }

    resetDialog.querySelector(".teacher-pin-close").addEventListener("click", closeResetDialog);
    resetDialog.querySelector(".teacher-pin-cancel").addEventListener("click", closeResetDialog);
    resetDialog.addEventListener("click", event=>{
      if(event.target === resetDialog){
        closeResetDialog();
      }
    });
    resetDialog.querySelectorAll("input").forEach(input=>{
      input.addEventListener("input", ()=>{
        input.value = input.value.replace(/\D/g, "").slice(0, 4);
      });
    });

    document.querySelectorAll("[data-reset-pin]").forEach(button=>{
      button.addEventListener("click", ()=>{
        status.textContent = navigator.onLine ? "" : "Internet connection is required to reset your PIN.";
        resetDialog.showModal();
        currentPin.focus();
      });
    });

    resetForm.addEventListener("submit", async event=>{
      event.preventDefault();
      status.textContent = "";

      if(!navigator.onLine){
        status.textContent = "Internet connection is required to reset your PIN.";
        return;
      }
      if(!/^\d{4}$/.test(currentPin.value) || !/^\d{4}$/.test(newPin.value)){
        status.textContent = "Current and new PINs must contain exactly 4 digits.";
        return;
      }
      if(newPin.value !== confirmPin.value){
        status.textContent = "The new PIN and confirmation do not match.";
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
      try{
        const response = await fetch("/api/teacher-change-pin", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ currentPin:currentPin.value, newPin:newPin.value })
        });
        const result = await response.json().catch(()=>({}));
        if(!response.ok){
          throw new Error(result.message || "Your PIN could not be changed.");
        }
        if(window.LearnerOffline && result.username){
          await LearnerOffline.rememberCredentials(result.username, newPin.value);
        }
        closeResetDialog();
        window.alert("Your PIN was changed successfully. Use the new PIN the next time you sign in.");
      }catch(error){
        status.textContent = error.message;
      }finally{
        saveButton.disabled = false;
        saveButton.textContent = "Save New PIN";
      }
    });

    document.querySelectorAll("[data-teacher-logout]").forEach(button=>{
      button.addEventListener("click", event=>{
        event.preventDefault();
        button.disabled = true;
        button.textContent = "Logging out...";
        logout();
      });
    });

    document.querySelectorAll("[data-guidance-login]").forEach(link=>{
      link.addEventListener("click", ()=>{
        window.LearnerOffline?.clearGuidanceSession?.();
      });
    });

    fetch("/api/teacher-session", { cache:"no-store" })
      .then(response=>response.ok ? response.json() : null)
      .then(session=>{
        if(session?.role === "admin"){
          document.querySelectorAll("[data-admin-only]").forEach(element=>{
            element.hidden = false;
          });
        }
        if(session?.ok && (session.displayName || session.username)){
          localStorage.setItem("bakhawCurrentTeacherSession", JSON.stringify({
            username:String(session.username || "").trim().toLowerCase(),
            displayName:String(session.displayName || session.username || "").trim(),
            savedAt:new Date().toISOString()
          }));
        }
      })
      .catch(()=>{});
  });
})();
