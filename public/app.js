const $ = (id) => document.getElementById(id);

let tasks = [];
let editingId = null;
let currentView = "dashboard";
let selectedDate = localDateString(new Date());
let calendarMonth = new Date();
calendarMonth.setDate(1);

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function prettyDate(value) {
  if (!value) return "No deadline";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

function notify(message, isError = false) {
  const eyebrow = $("eyebrow");
  eyebrow.textContent = message;
  eyebrow.style.color = isError ? "var(--danger)" : "var(--sage-dark)";
  window.setTimeout(() => {
    eyebrow.textContent = "YOUR PERSONAL SPACE";
    eyebrow.style.color = "";
  }, 3500);
}

function isCompleted(task) {
  return task.completed === true;
}

function isActive(task) {
  return task.isActive !== false && !isCompleted(task);
}

function isOverdue(task) {
  return Boolean(task.dueDate && task.dueDate < localDateString(new Date()) &&
    !isCompleted(task) && task.isActive !== false);
}

function emptyMessage(message) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

async function loadTasks() {
  try {
    const data = await apiRequest("/api/tasks");
    if (!Array.isArray(data)) throw new Error("The tasks API did not return a list.");
    tasks = data;
    renderAll();
  } catch (error) {
    console.error("Unable to load tasks:", error);
    tasks = [];
    renderAll();
    $("allTasksList").replaceChildren(emptyMessage(`Could not load tasks: ${error.message}`));
    $("todayList").replaceChildren(emptyMessage("Could not load tasks. Check that the server and MongoDB are running."));
    $("upcomingList").replaceChildren(emptyMessage("Could not load tasks."));
    $("dateTasksList").replaceChildren(emptyMessage("Could not load tasks."));
    notify("Could not load tasks — check the server", true);
  }
}

function renderAll() {
  renderDashboard();
  renderAllTasks();
  renderCalendar();
}

function showView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  $("pageTitle").textContent = ({ dashboard: "Dashboard", tasks: "All tasks", calendar: "Calendar" })[view] || "Dashboard";
  $("eyebrow").textContent = "YOUR PERSONAL SPACE";
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view));
});
document.querySelectorAll("[data-go-view]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.goView));
});

function openModal(task = null, defaultDate = "") {
  editingId = task ? task._id : null;
  $("taskForm").reset();
  $("modalTitle").textContent = task ? "Edit task" : "Add a task";
  $("saveTaskButton").textContent = task ? "Save changes" : "Save task";
  $("taskTitle").value = task?.title || "";
  $("taskDescription").value = task?.description || "";
  $("taskDueDate").value = task?.dueDate || defaultDate || "";
  $("taskPriority").value = task?.priority || "Medium";
  $("taskCompleted").checked = task?.completed === true;
  $("taskActive").checked = task ? task.isActive !== false : true;
  $("formMessage").textContent = "";
  $("taskModal").classList.remove("hidden");
  $("taskTitle").focus();
}

function closeModal() {
  $("taskModal").classList.add("hidden");
  editingId = null;
}

$("topAddButton").addEventListener("click", () => openModal(null, currentView === "calendar" ? selectedDate : ""));
$("welcomeAddButton").addEventListener("click", () => openModal());
$("addDateTask").addEventListener("click", () => openModal(null, selectedDate));
$("closeModal").addEventListener("click", closeModal);
$("cancelModal").addEventListener("click", closeModal);
$("taskModal").addEventListener("click", event => {
  if (event.target === $("taskModal")) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("taskModal").classList.contains("hidden")) closeModal();
});

$("taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    title: $("taskTitle").value.trim(),
    description: $("taskDescription").value.trim(),
    dueDate: $("taskDueDate").value,
    priority: $("taskPriority").value,
    completed: $("taskCompleted").checked,
    isActive: $("taskActive").checked
  };
  if (!payload.title) {
    $("formMessage").textContent = "Please enter a task name.";
    return;
  }

  const saveButton = $("saveTaskButton");
  saveButton.disabled = true;
  $("formMessage").textContent = "";

  try {
    if (editingId) {
      await apiRequest(`/api/tasks/${editingId}`, {
        method: "PUT", body: JSON.stringify(payload)
      });
      notify("Task updated.");
    } else {
      await apiRequest("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
      notify("Task added.");
    }
    closeModal();
    await loadTasks();
  } catch (error) {
    $("formMessage").textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

async function updateTask(id, changes) {
  try {
    await apiRequest(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(changes) });
    await loadTasks();
    notify("Task updated.");
  } catch (error) {
    notify(error.message, true);
  }
}

async function deleteTask(id) {
  const task = tasks.find(item => item._id === id);
  if (!confirm(`Delete "${task?.title || "this task"}"?`)) return;
  try {
    await apiRequest(`/api/tasks/${id}`, { method: "DELETE" });
    await loadTasks();
    notify("Task deleted.");
  } catch (error) {
    notify(error.message, true);
  }
}

function createCompactTask(task) {
  const item = document.createElement("div");
  item.className = `compact-task${isCompleted(task) ? " is-completed" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-check";
  checkbox.checked = isCompleted(task);
  checkbox.setAttribute("aria-label", "Mark task completed");
  checkbox.addEventListener("change", () => updateTask(task._id, { completed: checkbox.checked }));

  const info = document.createElement("div");
  info.className = "compact-task-info";
  const title = document.createElement("strong");
  title.textContent = task.title;
  const detail = document.createElement("p");
  detail.textContent = `${prettyDate(task.dueDate)} · ${task.priority || "Medium"} priority`;
  info.append(title, detail);
  item.append(checkbox, info);
  return item;
}

function renderCompactList(element, list, message) {
  element.replaceChildren();
  if (!list.length) {
    element.appendChild(emptyMessage(message));
    return;
  }
  list.forEach(task => element.appendChild(createCompactTask(task)));
}

function renderDashboard() {
  const done = tasks.filter(isCompleted).length;
  const inProgress = tasks.filter(isActive).length;
  const paused = tasks.filter(task => task.isActive === false && !isCompleted(task)).length;
  const late = tasks.filter(isOverdue).length;
  const percentage = tasks.length ? Math.round(done / tasks.length * 100) : 0;

  $("totalStat").textContent = tasks.length;
  $("completedStat").textContent = done;
  $("activeStat").textContent = inProgress;
  $("overdueStat").textContent = late;
  $("progressPercent").textContent = `${percentage}% complete`;
  $("progressRing").style.width = `${percentage}%`;
  $("legendCompleted").textContent = done;
  $("legendActive").textContent = inProgress;
  $("legendInactive").textContent = paused;

  const today = localDateString(new Date());
  renderCompactList(
    $("todayList"),
    tasks.filter(task => task.dueDate === today && task.isActive !== false),
    "Nothing scheduled for today."
  );
  const upcoming = tasks
    .filter(task => task.dueDate && task.dueDate > today && isActive(task))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  renderCompactList($("upcomingList"), upcoming, "No upcoming tasks. You're all caught up!");
}

function renderAllTasks() {
  const query = $("searchInput").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const priorityFilter = $("priorityFilter").value;

  const filtered = tasks.filter(task => {
    const matchesText = (task.title || "").toLowerCase().includes(query) ||
      (task.description || "").toLowerCase().includes(query);
    let matchesStatus = true;
    if (status === "active") matchesStatus = isActive(task);
    if (status === "inactive") matchesStatus = task.isActive === false && !isCompleted(task);
    if (status === "completed") matchesStatus = isCompleted(task);
    if (status === "pending") matchesStatus = !isCompleted(task);
    const matchesPriority = priorityFilter === "all" || (task.priority || "Medium") === priorityFilter;
    return matchesText && matchesStatus && matchesPriority;
  });

  const container = $("allTasksList");
  container.replaceChildren();
  if (!filtered.length) {
    container.appendChild(emptyMessage(tasks.length ? "No tasks match these filters." : "No tasks yet. Click “Add a task” to create your first one."));
    return;
  }

  filtered.forEach(task => {
    const row = document.createElement("div");
    row.className = `task-row${isCompleted(task) ? " is-completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = isCompleted(task);
    checkbox.setAttribute("aria-label", "Mark task completed");
    checkbox.addEventListener("change", () => updateTask(task._id, { completed: checkbox.checked }));

    const titleCell = document.createElement("div");
    titleCell.className = "row-task";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const description = document.createElement("p");
    description.textContent = task.description || "No description";
    titleCell.append(checkbox, title, description);

    const due = document.createElement("span");
    due.className = "due-date";
    due.textContent = prettyDate(task.dueDate);
    if (isOverdue(task)) due.classList.add("overdue-text");

    const priority = document.createElement("span");
    const priorityValue = task.priority || "Medium";
    priority.className = `priority priority-${priorityValue.toLowerCase()}`;
    priority.textContent = priorityValue;

    const statusText = isCompleted(task) ? "Completed" : task.isActive === false ? "Inactive" : "Active";
    const statusBadge = document.createElement("span");
    statusBadge.className = `status-badge ${statusText.toLowerCase()}`;
    statusBadge.textContent = statusText;

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.className = "small-action";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openModal(task));
    const toggle = document.createElement("button");
    toggle.className = "small-action";
    toggle.textContent = task.isActive === false ? "Activate" : "Pause";
    toggle.addEventListener("click", () => updateTask(task._id, { isActive: task.isActive === false }));
    const remove = document.createElement("button");
    remove.className = "small-action delete";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteTask(task._id));
    actions.append(edit, toggle, remove);

    row.append(checkbox, titleCell, due, priority, statusBadge, actions);
    container.appendChild(row);
  });
}

$("searchInput").addEventListener("input", renderAllTasks);
$("statusFilter").addEventListener("change", renderAllTasks);
$("priorityFilter").addEventListener("change", renderAllTasks);

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $("monthLabel").textContent = calendarMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const grid = $("calendarGrid");
  grid.replaceChildren();

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const value = localDateString(date);
    const scheduled = tasks.filter(task => task.dueDate === value && !isCompleted(task) && task.isActive !== false);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (date.getMonth() !== month) button.classList.add("other-month");
    if (value === localDateString(new Date())) button.classList.add("today");
    if (value === selectedDate) button.classList.add("selected");

    const number = document.createElement("span");
    number.textContent = date.getDate();
    button.appendChild(number);

    const dots = document.createElement("span");
    dots.className = "day-dot";
    scheduled.slice(0, 3).forEach(() => {
      const dot = document.createElement("i");
      dots.appendChild(dot);
    });
    button.appendChild(dots);

    button.setAttribute("aria-label", `${prettyDate(value)}, ${scheduled.length} unfinished active tasks`);
    button.addEventListener("click", () => {
      selectedDate = value;
      $("datePicker").value = value;
      renderCalendar();
    });
    grid.appendChild(button);
  }

  $("datePicker").value = selectedDate;
  $("selectedDateTitle").textContent = selectedDate === localDateString(new Date()) ? "Today's schedule" : prettyDate(selectedDate);
  const dateTasks = tasks.filter(task => task.dueDate === selectedDate);
  const list = $("dateTasksList");
  list.replaceChildren();

  if (!dateTasks.length) {
    list.appendChild(emptyMessage("No tasks scheduled for this date."));
    return;
  }

  dateTasks.forEach(task => {
    const wrapper = document.createElement("div");
    wrapper.className = "date-task-item";
    wrapper.appendChild(createCompactTask(task));
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.className = "small-action";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openModal(task));
    const remove = document.createElement("button");
    remove.className = "small-action delete";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteTask(task._id));
    actions.append(edit, remove);
    wrapper.appendChild(actions);
    list.appendChild(wrapper);
  });
}

$("prevMonth").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});
$("nextMonth").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});
$("datePicker").addEventListener("change", () => {
  if (!$("datePicker").value) return;
  selectedDate = $("datePicker").value;
  const [year, month] = selectedDate.split("-").map(Number);
  calendarMonth = new Date(year, month - 1, 1);
  renderCalendar();
});

showView("dashboard");
loadTasks();
