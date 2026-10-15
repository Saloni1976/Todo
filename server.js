const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/todoDB";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    dueDate: { type: String, default: "" },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    completed: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Task = mongoose.model("Task", taskSchema);

function validDate(value) {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Health check: visit /api/health to check server/database connection.
app.get("/api/health", (req, res) => {
  res.json({
    server: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks:", error);
    res.status(500).json({ message: "Could not load tasks. Check MongoDB connection." });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description = "", dueDate = "", priority = "Medium",
      completed = false, isActive = true } = req.body;

    if (typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ message: "Enter a task title (1–200 characters)." });
    }
    if (typeof description !== "string" || description.length > 1000) {
      return res.status(400).json({ message: "Description must be at most 1000 characters." });
    }
    if (!validDate(dueDate)) {
      return res.status(400).json({ message: "Please enter a valid due date." });
    }
    if (!["Low", "Medium", "High"].includes(priority)) {
      return res.status(400).json({ message: "Please choose a valid priority." });
    }
    if (typeof completed !== "boolean" || typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Task status values must be true or false." });
    }

    const task = await Task.create({
      title: title.trim(),
      description: description.trim(),
      dueDate,
      priority,
      completed,
      isActive
    });
    res.status(201).json(task);
  } catch (error) {
    console.error("POST /api/tasks:", error);
    res.status(500).json({ message: "Could not create task." });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    const allowed = ["title", "description", "dueDate", "priority", "completed", "isActive"];
    const updates = {};
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = req.body[field];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No changes were provided." });
    }

    if ("title" in updates) {
      if (typeof updates.title !== "string" || !updates.title.trim() || updates.title.trim().length > 200) {
        return res.status(400).json({ message: "Enter a valid task title." });
      }
      updates.title = updates.title.trim();
    }
    if ("description" in updates) {
      if (typeof updates.description !== "string" || updates.description.length > 1000) {
        return res.status(400).json({ message: "Description must be at most 1000 characters." });
      }
      updates.description = updates.description.trim();
    }
    if ("dueDate" in updates && !validDate(updates.dueDate)) {
      return res.status(400).json({ message: "Please enter a valid due date." });
    }
    if ("priority" in updates && !["Low", "Medium", "High"].includes(updates.priority)) {
      return res.status(400).json({ message: "Please choose a valid priority." });
    }
    if ("completed" in updates && typeof updates.completed !== "boolean") {
      return res.status(400).json({ message: "Invalid completion status." });
    }
    if ("isActive" in updates && typeof updates.isActive !== "boolean") {
      return res.status(400).json({ message: "Invalid active status." });
    }

    const task = await Task.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    if (!task) return res.status(404).json({ message: "Task not found." });
    res.json(task);
  } catch (error) {
    console.error("PUT /api/tasks/:id:", error);
    res.status(500).json({ message: "Could not update task." });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found." });
    res.json({ message: "Task deleted successfully." });
  } catch (error) {
    console.error("DELETE /api/tasks/:id:", error);
    res.status(500).json({ message: "Could not delete task." });
  }
});

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("MongoDB connected successfully!");
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    console.error("Check that MongoDB is running and MONGO_URI in .env is correct.");
    process.exit(1);
  }
}

startServer();
