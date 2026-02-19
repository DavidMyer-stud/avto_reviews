const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const app = express();

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: "secret_key_123",
    resave: false,
    saveUninitialized: true,
  }),
);

const connection = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "12345",
  database: process.env.DB_NAME || "avto_reviews",
  port: process.env.DB_PORT || 3306,
  ssl: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  },
});

connection.connect((err) => {
  if (err) console.error("Ошибка БД: " + err.message);
  else console.log("БД підключена!");
});

app.get("/", (req, res) => {
  const searchText = req.query.search;

  let sql = "SELECT * FROM cars";
  let params = [];

  if (searchText) {
    sql += " WHERE brand LIKE ? OR model LIKE ?";
    const searchPattern = `%${searchText}%`;
    params = [searchPattern, searchPattern];
  }

  connection.query(sql, params, (err, result) => {
    if (err) throw err;

    res.render("index", {
      cars: result,
      user: req.session.username,
      searchStr: searchText || "",
    });
  });
});

app.post("/register", (req, res) => {
  const { login, password } = req.body;
  const sql = "INSERT INTO users (login, password) VALUES (?, ?)";
  connection.query(sql, [login, password], (err) => {
    if (err) res.send("Логін зайнятий!");
    else res.redirect("/login.html");
  });
});

app.post("/login", (req, res) => {
  const { login, password } = req.body;
  const sql = "SELECT * FROM users WHERE login = ? AND password = ?";
  connection.query(sql, [login, password], (err, results) => {
    if (results.length > 0) {
      req.session.username = login;
      req.session.userId = results[0].id;
      res.redirect("/");
    } else {
      res.send("Невірний логін!");
    }
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/review/:id", (req, res) => {
  if (!req.session.username) {
    return res.send(
      "Спочатку увійдіть у свій акаунт! <a href='/login.html'>Вхід</a>",
    );
  }

  const carId = req.params.id;

  const sql = "SELECT * FROM cars WHERE id = ?";
  connection.query(sql, [carId], (err, result) => {
    if (err) throw err;

    res.render("review", { car: result[0] });
  });
});

app.get("/review/:id", (req, res) => {
  if (!req.session.username) {
    return res.send(
      "Спочатку увійдіть у свій акаунт! <a href='/login.html'>Вхід</a>",
    );
  }

  const carId = req.params.id;

  const sql = "SELECT * FROM cars WHERE id = ?";
  connection.query(sql, [carId], (err, result) => {
    if (err) throw err;

    res.render("review", { car: result[0] });
  });
});

app.post("/review/:id", (req, res) => {
  if (!req.session.username) return res.redirect("/login.html");

  const carId = req.params.id;
  const userId = req.session.userId;

  const { rating_engine, rating_interior, rating_reliability, text } = req.body;

  const sql = `INSERT INTO reviews 
                 (user_id, car_id, text, rating_engine, rating_interior, rating_reliability) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

  connection.query(
    sql,
    [userId, carId, text, rating_engine, rating_interior, rating_reliability],
    (err, result) => {
      if (err) {
        console.error(err);
        res.send("Помилка при збереженні!");
      } else {
        res.send(`
                <h1>Дякуємо! Ваш відгук збережено.</h1>
                <a href="/">Повернутися на головну</a>
            `);
      }
    },
  );
});

app.get("/car/:id", (req, res) => {
  const carId = req.params.id;

  const sqlCar = "SELECT * FROM cars WHERE id = ?";

  connection.query(sqlCar, [carId], (err, carResult) => {
    if (err) throw err;
    const car = carResult[0];

    const sqlReviews = `
            SELECT reviews.*, users.login 
            FROM reviews 
            JOIN users ON reviews.user_id = users.id 
            WHERE car_id = ?
            ORDER BY reviews.id DESC 
        `;

    connection.query(sqlReviews, [carId], (err, reviewsResult) => {
      if (err) throw err;

      res.render("car", {
        car: car,
        reviews: reviewsResult,
        user: req.session.username,
      });
    });
  });
});

// профіль
app.get("/profile", (req, res) => {
  if (!req.session.username) return res.redirect("/login.html");

  const userId = req.session.userId;

  // шукаємо відгуки ЦЬОГО юзера + назви машин
  // Ми з'єднуємо таблицю reviews і cars щоб знати про яку машину відгук
  const sql = `
        SELECT reviews.*, cars.brand, cars.model, cars.id as real_car_id 
        FROM reviews 
        JOIN cars ON reviews.car_id = cars.id 
        WHERE reviews.user_id = ?
        ORDER BY reviews.id DESC
    `;

  connection.query(sql, [userId], (err, result) => {
    if (err) console.error(err);

    res.render("profile", {
      reviews: result,
      user: req.session.username,
    });
  });
});

// адмін панель

app.get("/admin", (req, res) => {
  if (req.session.username !== "admin") {
    return res.send(
      "<h3>Доступ заборонено! Ви не адмін.</h3><a href='/'>На головну</a>",
    );
  }

  connection.query("SELECT * FROM cars", (err, result) => {
    if (err) throw err;
    res.render("admin", { cars: result });
  });
});

app.post("/admin/add", (req, res) => {
  if (req.session.username !== "admin") return res.redirect("/");

  const { brand, model, image_url } = req.body;

  const sql = "INSERT INTO cars (brand, model, image_url) VALUES (?, ?, ?)";
  connection.query(sql, [brand, model, image_url], (err) => {
    if (err) console.error(err);
    res.redirect("/admin");
  });
});

app.post("/admin/delete/:id", (req, res) => {
  if (req.session.username !== "admin") return res.redirect("/");

  const carId = req.params.id;

  connection.query("DELETE FROM reviews WHERE car_id = ?", [carId], (err) => {
    if (err) console.error(err);

    connection.query("DELETE FROM cars WHERE id = ?", [carId], (err) => {
      if (err) console.error(err);
      res.redirect("/admin");
    });
  });
});

app.post("/admin/delete-review/:id", (req, res) => {
  if (req.session.username !== "admin") {
    return res.send("Тільки адмін може видаляти відгуки!");
  }

  const reviewId = req.params.id;

  const sqlGetCar = "SELECT car_id FROM reviews WHERE id = ?";

  connection.query(sqlGetCar, [reviewId], (err, result) => {
    if (err || result.length === 0) {
      return res.redirect("/");
    }

    const carId = result[0].car_id;

    const sqlDelete = "DELETE FROM reviews WHERE id = ?";
    connection.query(sqlDelete, [reviewId], (err) => {
      if (err) console.error(err);

      res.redirect("/car/" + carId);
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер працює на порту ${PORT}`);
});
