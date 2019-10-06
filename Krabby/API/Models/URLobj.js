const mongoose = require("mongoose");

const URLobjSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users"
  },

  subscription_data: [
    //URL Object
    {
      url: {
        type: String,
        required: true
      },
      company: {
        type: String,
        required: true
      },
      product_name: {
        type: String,
        required: true
      },
      product_imageURL: {
        type: String,
        required: true
      },
      current_price: {
        type: Number,
        required: true
      },
      date: {
        type: Date,
        required: true
      },
      status: {
        type: String,
        required: true
      }
    }
  ]
});

module.exports = URLobj = mongoose.model("urlobj", URLobjSchema);
