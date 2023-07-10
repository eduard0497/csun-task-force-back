const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const knex = require("knex");
const bcrypt = require("bcrypt");
require("dotenv").config();
const nodemailer = require("nodemailer");
const saltRounds = 5;
const randomstring = require("randomstring");
const _DUMMY_GMAIL = process.env.EMAIL;
const _DUMMY_PASSWORD = process.env.PASSWORD;
const _SERVER_LINK = process.env.SERVER_LINK;
const _DB_USERS_TABLE = "users";
const _DB_CATEGORIES_TABLE = "categories";
const _DB_TASKS_TABLE = "tasks";

const app = express();
app.use(cors());
app.use(bodyParser.json());

process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const database = knex({
  client: "pg",
  connection: {
    //Testing data no longer relevant
    //host: "127.0.0.1",
    //user: "postgres",
    //password: "ed0497",
    //database: "csun_task_force",
    host: "comp380.clbokytymkwx.us-east-2.rds.amazonaws.com",
    port: 5432,
    user: "postgres",
    password: "secret380",
    database: "postgres",
  },
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: _DUMMY_GMAIL,
    pass: _DUMMY_PASSWORD,
  },
});

const mailOptions = (sendTo, subject, text) => {
  return {
    from: _DUMMY_GMAIL,
    to: sendTo,
    subject: subject,
    text: text,
  };
};

const sendEmail = (itemToMail) => {
  transporter.sendMail(itemToMail, (error, info) => {
    if (error) {
      console.log("Sending Email error");
    } else {
      console.log(info.response);
    }
  });
};

const authUser = async (req, res, next) => {
  const { user_id, access_token } = req.body;

  await database(_DB_USERS_TABLE)
    .select("*")
    .where({
      id: user_id,
      access_token: access_token,
    })
    .then((data) => {
      if (data.length != 0) {
        next();
      } else {
        res.json("Unauthorized User");
      }
    });
};

// delete this later
app.get("/get-all", async (req, res) => {
  let users = await database(_DB_USERS_TABLE).select("*");
  let categories = await database(_DB_CATEGORIES_TABLE).select("*");
  let tasks = await database(_DB_TASKS_TABLE).select("*");
  res.json({
    users,
    categories,
    tasks,
  });
});

// delete this later
app.get("/truncate-all", async (req, res) => {
  await database(_DB_USERS_TABLE).truncate();
  await database(_DB_CATEGORIES_TABLE).truncate();
  await database(_DB_TASKS_TABLE).truncate();
  res.json("All truncated");
});

app.post("/user-register", async (req, res) => {
  const { fname, lname, email, password } = req.body;

  const foundUserData = await database(_DB_USERS_TABLE)
    .select("*")
    .where({ email: email });
  if (foundUserData.length > 0) {
    res.json("user already exists");
  } else {
    const hashedPassword = await bcrypt.hashSync(password, saltRounds);
    const initialRandomString = randomstring.generate();

    database(_DB_USERS_TABLE)
      .returning("*")
      .insert({
        fname,
        lname,
        email,
        password: hashedPassword,
        email_active: false,
        access_token: initialRandomString,
      })
      .then(async (data) => {
        if (data.length == 0) {
          res.json("error occured, unable to add the user");
        } else {
          let constructedLink = `${_SERVER_LINK}/user-verify-email?user_id=${data[0].id}&access_token=${data[0].access_token}`;
          let objectThatHasMailOptions = mailOptions(
            email,
            "Email Verification",
            `Please click the link to verify: ${constructedLink}`
          );
          await sendEmail(objectThatHasMailOptions);
          res.json("user added successfully");
        }
      });
  }
});

app.get("/user-verify-email", (req, res) => {
  const { user_id, access_token } = req.query;

  database(_DB_USERS_TABLE)
    .select("*")
    .where({
      id: user_id,
      access_token,
    })
    .then(async (data) => {
      if (data.length != 1) {
        res.json("Unable to find the user");
      } else if (data[0].email_active) {
        res.json("Email is already active");
      } else {
        database(_DB_USERS_TABLE)
          .returning("*")
          .update({ email_active: true })
          .where({
            id: user_id,
            access_token,
          })
          .then(() => res.json("Email has been activated"));
      }
    });
});

app.post("/user-login", (req, res) => {
  const { email, password } = req.body;

  database(_DB_USERS_TABLE)
    .select("*")
    .where({ email })
    .then(async (data) => {
      // let answer = await bcrypt.compare(password, data[0].password)
      if (data.length < 1) {
        res.json("User does not exist");
      } else if ((await bcrypt.compare(password, data[0].password)) != true) {
        res.json("Wrong password");
      } else if (!data[0].email_active) {
        res.json("The email has not been verified yet");
      } else {
        const randomString = randomstring.generate();
        database(_DB_USERS_TABLE)
          .returning("*")
          .update({
            access_token: randomString,
          })
          .where({
            email,
          })
          .then((data) => {
            res.json({
              user_id: data[0].id,
              access_token: data[0].access_token,
              first_name: data[0].fname,
              last_name: data[0].lname,
              date_registered: data[0].timestamp,
            });
          });
      }
    });
});

app.post("/get-user-categories", authUser, (req, res) => {
  const { user_id } = req.body;

  database(_DB_CATEGORIES_TABLE)
    .select("*")
    .where({
      user_id,
    })
    .then((data) => {
      res.json({
        categories: data,
      });
    });
});

app.post("/add-user-category", authUser, (req, res) => {
  const { user_id, category } = req.body;

  database(_DB_CATEGORIES_TABLE)
    .select("*")
    .where({
      user_id,
      category,
    })
    .then((data) => {
      if (data.length != 0) {
        res.json({ msg: "Category already exists" });
      } else {
        database(_DB_CATEGORIES_TABLE)
          .returning("*")
          .insert({
            user_id,
            category,
          })
          .then((data) => {
            res.json({
              addedCategory: data[0],
            });
          });
      }
    });
});

app.delete("/delete-user-category", authUser, (req, res) => {
  const { id } = req.body;

  database(_DB_CATEGORIES_TABLE)
    .returning("*")
    .del()
    .where({
      id,
    })
    .then((data) => {
      res.json("Deleted");
    });
});

app.post("/get-user-tasks", authUser, (req, res) => {
  const { user_id } = req.body;

  database(_DB_TASKS_TABLE)
    .select("*")
    .where({
      user_id,
    })
    .then((data) => {
      res.json({
        tasks: data,
      });
    });
});

app.post("/add-user-task", authUser, (req, res) => {
  const { user_id, title, description, date, category } = req.body;

  let dateSet = date;
  if (!date) dateSet = null;

  database(_DB_TASKS_TABLE)
    .returning("*")
    .insert({
      user_id,
      title,
      description,
      date: dateSet,
      category,
      completed: false,
    })
    .then((data) => {
      res.json({
        addedTask: data[0],
      });
    });
});

app.put("/complete-user-task", authUser, (req, res) => {
  const { id } = req.body;

  database(_DB_TASKS_TABLE)
    .returning("*")
    .update({
      completed: true,
    })
    .where({
      id,
    })
    .then((data) => {
      if (data.length === 0) {
        res.json("Unable to complete");
      } else {
        res.json("Updated Successfully");
      }
    });
});

app.put("/uncomplete-user-task", authUser, (req, res) => {
  const { id } = req.body;

  database(_DB_TASKS_TABLE)
    .returning("*")
    .update({
      completed: false,
    })
    .where({
      id,
    })
    .then((data) => {
      if (data.length === 0) {
        res.json("Unable to complete");
      } else {
        res.json("Updated Successfully");
      }
    });
});

app.delete("/delete-user-task", authUser, (req, res) => {
  const { id } = req.body;

  database(_DB_TASKS_TABLE)
    .returning("*")
    .del()
    .where({
      id,
    })
    .then((data) => {
      if (data.length === 0) {
        res.json("Unable to complete");
      } else {
        res.json("Updated Successfully");
      }
    });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is live now");
});
