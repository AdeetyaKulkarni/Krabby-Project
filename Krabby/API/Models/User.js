const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  pin: {
    type: String,
    required: true
  },
  subscriptions: [
    {
      url: { type: String, required: false },
      company_name: { type: String, required: false }
    }
  ]
});

//Here modelname is "user" == table name
module.exports = UserModel = mongoose.model("user", userSchema);
