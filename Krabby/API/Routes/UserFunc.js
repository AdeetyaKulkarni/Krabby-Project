const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");

//Get the user model
const User = require("../Models/User");
const Engine = require("./Engine");

// @route    GET /test
// @desc     Test function
// @access   Public

router.get("/test", async (req, res) => {
  try {
    res.status(200).send({ response: new Date() });
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

// @route    POST /user/login
// @desc     Login User
// @access   Public

router.post(
  "/login",
  [
    check("email", "Please provide email").isEmail(),
    check("pin", "Please provide a pin")
      .not()
      .isEmpty()
  ],
  async (req, res) => {
    //Input handling
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.send({ errors: errors.array() });
    }

    try {
      const { email, pin } = req.body;

      const user = await User.findOne({ email: email });

      if (!user) {
        return res.status(400).json({ errors: [{ msg: "User not found" }] });
      }

      const isMatched = await bcrypt.compare(pin, user.pin);

      if (!isMatched) {
        return res
          .status(400)
          .json({ errors: [{ msg: "Invalid login credentials" }] });
      }

      res.json({ id: user.id });
    } catch (err) {
      console.log(err);
      res.status(500).send("MongoDB error");
    }
  }
);

// @route    POST /user
// @desc     Register User
// @access   Public

router.post(
  "/",
  [
    check("name", "Name is required")
      .not()
      .isEmpty(),
    check("email", "Please include valid email address").isEmail(),
    check("pin", "Please provide a 4-digit pin").isLength({ max: 4 })
  ],
  async (req, res) => {
    //Wrong input handling
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(500).json({ errors: errors.array() });
    }

    //If not badrequest
    const { name, email, pin } = req.body;

    try {
      //Check if not preregistered
      //Find by email
      let user = await User.findOne({ email: email });
      if (user) {
        return res
          .status(400)
          .json({ errors: [{ msg: "User already exists" }] });
      }

      user = new UserModel({
        name,
        email,
        pin
      });

      const salt = await bcrypt.genSalt(10); // 10 is ideal weight - await response
      user.pin = await bcrypt.hash(pin, salt); //This hashes the pin using the salt - await response
      await user.save();

      urlobj = new URLobj({
        user: user.id,
        subscription_data: []
      });

      await urlobj.save();

      //Scheduler(user.id);
      //MailMan(user.id, user.email);

      res.status(200).send({ user });
    } catch (err) {
      console.log(err);
      res.status(500).send({ err: "Database error" });
    }
  }
);

module.exports = router;
