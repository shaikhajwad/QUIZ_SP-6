const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(
  session({
    secret: "software_project_6", // Use a strong secret for your application
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static("public"));

// Set view engine
app.set("view engine", "ejs");

// Home Route (Login Page)

app.get("/", (req, res) => {
  // Check if the user is already logged in
  if (req.session.user) {
    // Redirect based on user role
    if (req.session.role === "teacher") {
      return res.redirect("/teacher/dashboard"); // Redirect to teacher dashboard
    } else if (req.session.role === "student") {
      return res.redirect("/quiz"); // Redirect to quiz page
    }
  }
  // If no session or user logged in, render the login page
  res.render("login");
});

app.get("/register", (req, res) => {
  res.render("register"); // This renders the register.ejs view
});

// Route to handle the form submission for registration
app.post("/register", (req, res) => {
  const { username, password, role } = req.body;

  // Check if the username already exists
  const query = "SELECT * FROM users WHERE username = ?";
  db.execute(query, [username], (err, results) => {
    if (err) {
      console.error("Error checking username:", err);
      return res.status(500).send("Server error");
    }

    if (results.length > 0) {
      // Username already exists
      return res.status(400).send("Username already taken");
    }

    // Hash the password before storing it
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        return res.status(500).send("Server error");
      }

      // Insert the new user into the database
      const insertQuery =
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)";
      db.execute(
        insertQuery,
        [username, hashedPassword, role],
        (err, result) => {
          if (err) {
            console.error("Error creating user:", err);
            return res.status(500).send("Server error");
          }

          // Send HTML response with popup and redirect
          res.send(`
              <html>
                <head>
                  <title>Account Created</title>
                  <style>
                    .popup {
                      position: fixed;
                      top: 50%;
                      left: 50%;
                      transform: translate(-50%, -50%);
                      padding: 20px;
                      background-color: #4CAF50;
                      color: white;
                      font-size: 16px;
                      border-radius: 5px;
                      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                    }
                  </style>
                </head>
                <body>
                  <div class="popup">
                    <h2>Account created successfully!</h2>
                  </div>
                  <script>
                    setTimeout(function() {
                      window.location.href = '/'; // Redirect to the login page after 2 seconds
                    }, 2000);
                  </script>
                </body>
              </html>
            `);
        }
      );
    });
  });
});

// Login Route
app.post("/login", (req, res) => {
  const { username, password, role } = req.body;

  const query = "SELECT * FROM users WHERE username = ? AND role = ?";
  db.execute(query, [username, role], (err, results) => {
    if (err) {
      console.error("Error fetching user:", err);
      return res.status(500).send("Server error");
    }

    if (results.length > 0) {
      const user = results[0];

      // Compare hashed passwords
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (isMatch) {
          req.session.user = user; // Store user in session
          req.session.role = role; // Store role in session

          // Redirect based on user role
          if (role === "teacher") {
            res.redirect("/teacher/dashboard");
          } else {
            res.redirect("/quiz");
          }
        } else {
          res.status(401).send("Invalid credentials");
        }
      });
    } else {
      res.status(401).send("Invalid credentials");
    }
  });
});

// Teacher Dashboard (Create Question)
app.get("/teacher/dashboard", (req, res) => {
  if (!req.session.user || req.session.user.role !== "teacher") {
    return res.redirect("/");
  }
  res.render("teacher_dashboard");
});

// Teacher Submit Question
app.post("/teacher/submit-questions", (req, res) => {
  const questions = req.body.questions;

  if (!questions || typeof questions !== "object") {
    return res.status(400).send("Invalid input");
  }

  const insertQuestionQuery =
    "INSERT INTO questions (question_text, teacher_id) VALUES (?, ?)";
  const insertOptionsQuery =
    "INSERT INTO options (option_text, question_id, is_correct) VALUES (?, ?, ?)";

  const promises = Object.values(questions).map((question) => {
    return new Promise((resolve, reject) => {
      const { question_text, options, correct_option } = question;

      db.execute(
        insertQuestionQuery,
        [question_text, req.session.user.id],
        (err, result) => {
          if (err) return reject(err);

          const question_id = result.insertId;

          const optionPromises = options.map((option, index) => {
            const isCorrect = index === parseInt(correct_option, 10);
            return new Promise((optResolve, optReject) => {
              db.execute(
                insertOptionsQuery,
                [option, question_id, isCorrect ? 1 : 0],
                (err) => {
                  if (err) return optReject(err);
                  optResolve();
                }
              );
            });
          });

          Promise.all(optionPromises).then(resolve).catch(reject);
        }
      );
    });
  });

  Promise.all(promises)
    .then(() => {
      // Send a success response with a script to show the popup and redirect
      res.send(`
          <html>
            <head>
              <title>Success</title>
              <style>
                .popup {
                  position: fixed;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%);
                  padding: 20px;
                  background-color: #4CAF50;
                  color: white;
                  font-size: 16px;
                  border-radius: 5px;
                  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                }
              </style>
            </head>
            <body>
              <div class="popup">
                <h2>Questions Submitted Successfully!</h2>
              </div>
              <script>
                setTimeout(function() {
                  window.location.href = '/teacher/view-questions'; // Redirect after 3 seconds
                }, 1000);
              </script>
            </body>
          </html>
        `);
    })
    .catch((err) => {
      console.error("Error inserting questions:", err);
      res.status(500).send("An error occurred while saving questions.");
    });
});

// Route to display existing questions
app.get("/teacher/view-questions", (req, res) => {
  // Check if the user is logged in and is a teacher
  if (!req.session.user || req.session.role !== "teacher") {
    return res.redirect("/"); // Redirect to login page if not logged in or not a teacher
  }

  // Query to get the questions for the logged-in teacher
  const query = `
      SELECT q.id, q.question_text, GROUP_CONCAT(o.option_text ORDER BY o.id) AS options 
      FROM questions q
      LEFT JOIN options o ON q.id = o.question_id
      WHERE q.teacher_id = ?
      GROUP BY q.id`;

  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error("Error fetching questions:", err);
      return res.status(500).send("Error fetching questions");
    }

    res.render("view-questions", { questions: results }); // Render questions page if teacher
  });
});

app.post("/teacher/delete-question/:id", (req, res) => {
  const questionId = req.params.id;

  // Delete options first to avoid foreign key constraint errors
  const deleteOptionsQuery = "DELETE FROM options WHERE question_id = ?";
  const deleteQuestionQuery = "DELETE FROM questions WHERE id = ?";

  db.query(deleteOptionsQuery, [questionId], (err) => {
    if (err) {
      console.error("Error deleting options:", err);
      return res.status(500).send("Error deleting options");
    }

    db.query(deleteQuestionQuery, [questionId], (err) => {
      if (err) {
        console.error("Error deleting question:", err);
        return res.status(500).send("Error deleting question");
      }

      res.redirect("/teacher/view-questions");
    });
  });
});

app.get("/quiz", (req, res) => {
  if (req.session.user && req.session.role === "student") {
    // Query to get all questions and options
    const query = `
  SELECT q.id AS question_id, q.question_text, o.id AS option_id, o.option_text, o.is_correct 
  FROM questions q
  LEFT JOIN options o ON q.id = o.question_id
`;

    db.query(query, (err, results) => {
      if (err) {
        console.log("Error fetching data:", err);
        res.status(500).send("Server error");
        return;
      }

      // Organize questions and options in a structured way
      const questions = [];
      results.forEach((row) => {
        const question = questions.find((q) => q.id === row.question_id);
        if (question) {
          question.options.push({
            id: row.option_id,
            text: row.option_text,
            is_correct: row.is_correct,
          });
        } else {
          questions.push({
            id: row.question_id,
            text: row.question_text,
            options: [
              {
                id: row.option_id,
                text: row.option_text,
                is_correct: row.is_correct,
              },
            ],
          });
        }
      });

      // Render the EJS template with questions and options
      res.render("quiz", { questions });
    });
  } else {
    res.redirect("/"); // If not logged in or not a student, redirect to login
  }
});

app.post("/submit-quiz", (req, res) => {
    const answers = req.body; // { q20: '72', q21: '75' }
  
    console.log("Submitted answers:", answers);
  
    // Initialize score
    let score = 0;
  
    // Initialize counter for completed queries
    let completedQueries = 0;
    const totalQuestions = Object.keys(answers).length; // Total number of questions answered
  
    // Loop through each submitted answer and check if it's correct
    const questionIds = Object.keys(answers); // Extract question ids like ['q20', 'q21']
  
    questionIds.forEach((questionId) => {
      const selectedOptionId = answers[questionId]; // Get the selected option ID
  
      console.log(`Question: ${questionId}, Selected Option: ${selectedOptionId}`);
  
      // Get the correct option for this question from the database
      const questionIdNum = questionId.replace("q", ""); // Remove "q" to get numeric question ID
      const query = `
          SELECT id FROM options WHERE question_id = ? AND is_correct = 1
        `;
  
      db.query(query, [questionIdNum], (err, result) => {
        if (err) {
          console.log("Error fetching correct option:", err);
          return;
        }
  
        console.log(`Correct Option ID for Question ${questionIdNum}:`, result);
  
        if (result.length > 0) {
          const correctOptionId = result[0].id; // Get the correct option ID for the question
  
          console.log(
            `Comparing: Selected Option ${selectedOptionId} with Correct Option ${correctOptionId}`
          );
  
          // Check if the selected option is correct
          if (selectedOptionId === correctOptionId.toString()) {
            score++; // Increment score if correct
            console.log(`Correct answer for Question ${questionIdNum}`);
          } else {
            console.log(`Incorrect answer for Question ${questionIdNum}`);
          }
        } else {
          console.log(`No correct option found for Question ${questionIdNum}`);
        }
  
        // Increment the counter for completed queries
        completedQueries++;
  
        // After all queries are completed, send the final score
        if (completedQueries === totalQuestions) {
          res.send(`
            <html>
              <head>
                <title>Quiz Result</title>
                <style>
                  .popup {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    padding: 20px;
                    background-color: #4CAF50;
                    color: white;
                    font-size: 16px;
                    border-radius: 5px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                    z-index: 1000;
                    display: none;
                  }
                  .countdown {
                    font-size: 14px;
                    margin-top: 10px;
                  }
                </style>
              </head>
              <body>
                <div class="popup" id="result-popup">
                  <h2>Your Score: <span id="score">${score}</span> / <span id="total">${totalQuestions}</span></h2>
                  <div class="countdown" id="countdown"></div>
                </div>
                
                <script>
                  let countdown = 3; // Set the countdown time in seconds
                  const countdownElement = document.getElementById("countdown");
  
                  // Show the popup
                  const popup = document.getElementById("result-popup");
                  popup.style.display = "block";
  
                  // Update the countdown every second
                  const interval = setInterval(function() {
                    countdownElement.textContent = "Redirecting in " + countdown + " seconds...";
                    countdown--;
  
                    if (countdown < 0) {
                      clearInterval(interval); // Stop the countdown
                      window.location.href = "/quiz"; // Redirect to the quiz page
                    }
                  }, 1000);
                </script>
              </body>
            </html>
          `);
        }
      });
    });
  });
  

// Logout Route
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error logging out");
    }
    res.redirect("/"); // Redirect to the login page after logging out
  });
});

// Start the server
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
