const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql");
const session = require("express-session");
const util = require("util");
const check = require("./vaild_data");
const path = require("path");

const connection = mysql.createConnection({
  database: "misc",
  port: 3306,
  host: "127.0.0.1",
  user: "root",
  password: "",
});

app.use(express.static(path.join(__dirname, "profile-frontend/build")));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);
app.use(
  session({
    secret: "keyboard cat",
    resave: true,
    saveUninitialized: true,
  })
);

app.get("/api/auth", (req, res) => {
  if (req.session.user) {
    res.json({ ...req.session.user, auth: true });
  } else {
    res.json({ auth: false });
  }
  res.status(200).end();
});

app.post("/api/login", (req, res) => {
  if (req.body.email && req.body.password) {
    const salt = "XyZzy12*_";
    const email = req.body.email;
    const password = require("crypto")
      .createHash("md5")
      .update(salt + req.body.password)
      .digest("hex");
    console.log("Email : " + email + ", Password : " + password);
    const sql = "SELECT user_id , name FROM Users WHERE email=? AND password=?";
    connection.query(sql, [email, password], (error, result) => {
      if (error) throw error;
      if (result.length > 0) {
        console.log(JSON.stringify(result[0]));
        req.session.user = { ...result[0] };
        res.json({ ...result[0], find: true });
      } else {
        res.json({ find: false });
      }
      console.log(req.session.user);
      res.end();
    });
  } else {
    res.send("Body Failed");
    res.status(400);
    res.end();
  }
});

app.get("/api/logout", (req, res) => {
  if (req.session.user) {
    req.session.destroy();
  }
  res.status(200).end();
});

app.get("/api/profile_list", (_, res) => {
  let errorStatus = 500;
  try {
    const sql =
      "SELECT profile_id , user_id , first_name , last_name , headline FROM Profile";
    connection.query(sql, (error, result) => {
      if (error) throw error;
      res.json(result);
      res.status(200).end();
    });
  } catch (error) {
    console.error(error);
    res.json({ error: String(error) });
    res.status(errorStatus).end();
  }
});

const query = util.promisify(connection.query).bind(connection);

app.get("/api/view", async (req, res) => {
  try {
    let result = [];
    let profile_id = req.query.profile_id;
    let sql =
      "SELECT first_name , last_name , email , headline , summary FROM Profile WHERE profile_id = ?";
    result = await query(sql, [profile_id]);
    let profile =
      result.length > 0 ? { ...result[0], find: true } : { find: false };
    if (profile.find) {
      sql =
        "SELECT rank , year , description FROM Position WHERE profile_id = ? ORDER BY rank";
      let position = await query(sql, [profile_id]);
      sql =
        "SELECT Education.rank , Education.year , Institution.name  FROM Education JOIN Institution WHERE Education.profile_id = ? AND Institution.institution_id = Education.institution_id ORDER BY Education.rank";
      let education = await query(sql, [profile_id]);
      res.json({ ...profile, position: position, education: education });
    } else {
      res.json(profile);
    }
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.json({ error: String(error) });
    res.status(500).end();
  }
});

app.post("/api/add", async (req, res) => {
  let errorStatus = 500;
  try {
    if (req.session.user === undefined) {
      errorStatus = 401;
      throw new Error("You are not loggin.");
    }
    if (
      !(
        req.body.first_name &&
        req.body.last_name &&
        req.body.email &&
        req.body.email.match(
          /^\w+([\\.-]?\w+)*@\w+([\\.-]?\w+)*(\.\w{2,3})+$/g
        ) &&
        req.body.headline &&
        req.body.summary &&
        check.checkEducation(req.body.education) &&
        check.checkPosition(req.body.position)
      )
    ) {
      errorStatus = 400;
      throw new Error("Data incorrect format.");
    }
    body = req.body;
    let sql =
      "INSERT INTO Profile (user_id, first_name, last_name, email, headline, summary) VALUES ( ?, ?, ?, ?, ?, ?)";
    let result = await query(sql, [
      req.session.user.user_id,
      body.first_name,
      body.last_name,
      body.email,
      body.headline,
      body.summary,
    ]);
    sql =
      "INSERT INTO `Position` (profile_id, rank, year, description) VALUES (?, ?, ?, ?)";
    for (let i in body.position) {
      await query(sql, [
        result.insertId,
        i + 1,
        Number(body.position[i].year),
        body.position[i].description,
      ]);
    }
    sql =
      "INSERT INTO `Education` (profile_id,institution_id, rank, year) VALUES (?, ?, ?, ?)";
    for (let i in body.education) {
      let sub_result = await query(
        "SELECT institution_id FROM `Institution` WHERE name = ?",
        [body.education[i].name]
      );
      let institution_id =
        sub_result.length > 0
          ? sub_result[0].institution_id
          : (
              await query("INSERT INTO `Institution` (name) VALUES (?) ", [
                body.education[i].name,
              ])
            ).insertId;
      await query(sql, [
        result.insertId,
        institution_id,
        i + 1,
        Number(body.education[i].year),
      ]);
    }
    res.json({ success: true });
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.json({ success: false, error: error });
    res.status(errorStatus).end();
  }
});

app.get("/api/edit", async (req, res) => {
  let errorStatus = 500;
  try {
    if (req.session.user === undefined) {
      errorStatus = 401;
      throw new Error("You are not loggin.");
    }
    if (req.query.profile_id) {
      let result = await query(
        "SELECT user_id FROM Profile WHERE profile_id = ?",
        [req.query.profile_id]
      );
      if (result.length === 0) {
        errorStatus = 404;
        throw new Error("Not Found profile_id:" + req.query.profile_id);
      }
      if (result[0].user_id !== req.session.user.user_id) {
        errorStatus = 403;
        throw new Error(
          `user_id:${req.session.user.user_id} Not permission editing.`
        );
      }
    } else {
      errorStatus = 400;
      throw new Error("Require profile_id");
    }
    let profile_id = req.query.profile_id;
    let sql =
      "SELECT first_name , last_name , email , headline , summary FROM Profile WHERE profile_id = ?";
    result = await query(sql, [profile_id]);
    let profile = { ...result[0], find: true };
    sql =
      "SELECT rank , year , description FROM Position WHERE profile_id = ? ORDER BY rank";
    let position = await query(sql, [profile_id]);
    sql =
      "SELECT Education.rank , Education.year , Institution.name  FROM Education JOIN Institution WHERE Education.profile_id = ? AND Institution.institution_id = Education.institution_id ORDER BY Education.rank";
    let education = await query(sql, [profile_id]);
    res.json({ ...profile, position: position, education: education });
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.json({ find: false, error: String(error) });
    res.status(errorStatus).end();
  }
});

app.put("/api/edit", async (req, res) => {
  let errorStatus = 500;
  try {
    if (req.session.user === undefined) {
      errorStatus = 401;
      throw new Error("You are not loggin.");
    }
    if (req.query.profile_id) {
      let result = await query(
        "SELECT user_id FROM Profile WHERE profile_id = ?",
        [req.query.profile_id]
      );
      if (result.length === 0) {
        errorStatus = 404;
        throw new Error("Not Found profile_id:" + req.query.profile_id);
      }
      if (result[0].user_id !== req.session.user.user_id) {
        errorStatus = 403;
        throw new Error(
          `user_id:${req.session.user.user_id} Not permission editing.`
        );
      }
    } else {
      errorStatus = 400;
      throw new Error("Require profile_id");
    }
    if (
      !(
        req.body.first_name &&
        req.body.last_name &&
        req.body.email &&
        req.body.email.match(
          /^\w+([\\.-]?\w+)*@\w+([\\.-]?\w+)*(\.\w{2,3})+$/g
        ) &&
        req.body.headline &&
        req.body.summary &&
        check.checkEducation(req.body.education) &&
        check.checkPosition(req.body.position)
      )
    ) {
      errorStatus = 400;
      throw new Error("Data incorrect format.");
    }
    profile_id = req.query.profile_id;
    body = req.body;
    let sql =
      "UPDATE Profile SET first_name=?, last_name=?, email=?, headline=?, summary=? WHERE profile_id=?";
    await query(sql, [
      body.first_name,
      body.last_name,
      body.email,
      body.headline,
      body.summary,
      profile_id,
    ]);
    let oldrows = await query(
      "SELECT position_id FROM `Position` WHERE profile_id = ?",
      [profile_id]
    );
    for (let i = 0; i < 9; i++) {
      if (i < oldrows.length && i < body.position.length) {
        sql =
          "UPDATE `Position` SET rank=? , year=?, description=? WHERE position_id=?";
        await query(sql, [
          i + 1,
          Number(body.position[i].year),
          body.position[i].description,
          oldrows[i].position_id,
        ]);
      } else if (i < oldrows.length) {
        sql = "DELETE FROM `Position` WHERE position_id=?";
        await query(sql, [oldrows[i].position_id]);
      } else if (i < body.position.length) {
        sql =
          "INSERT INTO `Position` (profile_id, rank, year, description) VALUES (?, ?, ?, ?)";
        await query(sql, [
          profile_id,
          i + 1,
          Number(body.position[i].year),
          body.position[i].description,
        ]);
      }
    }
    await query("DELETE FROM `Education` WHERE profile_id = ?", [profile_id]);
    sql =
      "INSERT INTO `Education` (profile_id,institution_id, rank, year) VALUES (?, ?, ?, ?)";
    for (let i in body.education) {
      let sub_result = await query(
        "SELECT institution_id FROM `Institution` WHERE name = ?",
        [body.education[i].name]
      );
      let institution_id =
        sub_result.length > 0
          ? sub_result[0].institution_id
          : (
              await query("INSERT INTO `Institution` (name) VALUES (?) ", [
                body.education[i].name,
              ])
            ).insertId;
      await query(sql, [
        profile_id,
        institution_id,
        i + 1,
        Number(body.education[i].year),
      ]);
    }
    res.json({ success: true });
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.json({ success: false, error: String(error) });
    res.status(errorStatus).end();
  }
});

app.get("/api/delete", async (req, res) => {
  let errorStatus = 500;
  try {
    if (req.session.user === undefined) {
      errorStatus = 401;
      throw new Error("You are not loggin.");
    }
    if (req.query.profile_id) {
      let result = await query(
        "SELECT user_id FROM Profile WHERE profile_id = ?",
        [req.query.profile_id]
      );
      if (result.length === 0) {
        errorStatus = 404;
        throw new Error("Not Found profile_id:" + req.query.profile_id);
      }
      if (result[0].user_id !== req.session.user.user_id) {
        errorStatus = 403;
        throw new Error(
          `user_id:${req.session.user.user_id} Not permission editing.`
        );
      }
    } else {
      errorStatus = 400;
      throw new Error("Require profile_id");
    }
    let profile_id = req.query.profile_id;
    let sql = "SELECT first_name , last_name FROM Profile WHERE profile_id = ?";
    result = await query(sql, [profile_id]);
    let profile = { ...result[0], find: true };
    res.json(profile);
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.json({ find: false, error: String(error) });
    res.status(errorStatus).end();
  }
});

app.delete("/api/delete", async (req, res) => {
  let errorStatus = 500;
  try {
    if (req.session.user === undefined) {
      errorStatus = 401;
      throw new Error("You are not loggin.");
    }
    if (req.query.profile_id) {
      let result = await query(
        "SELECT user_id FROM Profile WHERE profile_id = ?",
        [req.query.profile_id]
      );
      if (result.length === 0) {
        errorStatus = 404;
        throw new Error("Not Found profile_id:" + req.query.profile_id);
      }
      if (result[0].user_id !== req.session.user.user_id) {
        errorStatus = 403;
        throw new Error(
          `user_id:${req.session.user.user_id} Not permission editing.`
        );
      }
    } else {
      errorStatus = 400;
      throw new Error("Require profile_id");
    }
    let profile_id = req.query.profile_id;
    let sql = "DELETE FROM Profile WHERE profile_id = ?";
    result = await query(sql, [profile_id]);
    res.json({ success: true });
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.json({ success: false, error: String(error) });
    res.status(errorStatus).end();
  }
});

app.get("/api/school", async (req, res) => {
  try {
    const name = req.query.term;
    const sql = "SELECT name FROM `Institution` WHERE name LIKE ?";
    const result = await query(sql, [`${name}%`]);
    res.json({ name: result.map((value) => value.name) });
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "profile-frontend/build/index.html"));
});

const port = process.env.PORT || 7000;
const host = process.env.HOST || "localhost";
app.listen(port, host, () =>
  console.log(`Server is running port ${port} host ${host}`)
);
