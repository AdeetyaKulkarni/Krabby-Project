const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const cron = require("node-cron");
const axios = require("axios");
const cheerio = require("cheerio");
const URLobj = require("../Models/URLobj");
const User = require("../Models/User");
const nodemailer = require("nodemailer");
//Main creator, updater, scraper and scheduler

//------------------------------------------Parsers-------------------------------------------------------

Nike_parser = resp => {
  const $ = cheerio.load(resp);

  let price = "";
  let img = "";
  let name = "";

  try {
    name = $('h1[class = "headline-lg-base css-33lwh4"]').html();
    img = $("picture")
      .html()
      .match(new RegExp("https.*.jpg"))[0];
    price =
      "$ " +
      $('div[class = "css-b9fpep"]')
        .text()
        .split("$")[1];
    if (price === "$ undefined") {
      //Item is on sale
      //css-i260wg
      price =
        "$ " +
        $('div[class = "css-i260wg"]')
          .text()
          .split("$")[1];
    }

    return { name, img, price };
  } catch (err) {
    return { Error: "This item is not supported" };
  }
};

HNM_parser = resp => {
  const $ = cheerio.load(resp);

  let price = "";
  let img = "";
  let name = "";

  try {
    name = $("title")
      .html()
      .split("|")[0]
      .trim();
    img =
      "https:" +
      $('div[class="product-detail-main-image-container"]')
        .html()
        .match(new RegExp("//.*]"));
    img = img.replace("&amp;", "&");
    price =
      "$ " +
      $('div[class="primary-row product-item-price"]')
        .text()
        .split("$")[1]
        .replace("\n", "")
        .trim();
    return { name, img, price };
  } catch (err) {
    return { Error: "This item is not supported" };
  }

  return { name, img, price };
};

Myntra_parser = resp => {
  const $ = cheerio.load(resp);
  //console.log(resp)

  let price = "";
  let img = "";
  let name = "";

  try {
    name = $("title")
      .html()
      .split("|")[0]
      .split("-")[0]
      .replace("Buy", "")
      .replace("&amp;", "&")
      .replace("&apos;", "'")
      .trim();

    price = String(
      $("head")
        .html()
        .match(new RegExp('content=".*Rs.*'))
    ).match(new RegExp("Rs. [0-9]*"))[0];

    img = String(
      $("head")
        .html()
        .match(new RegExp('content=".*.jpg'))
    ).split('"')[1];

    return { name, img, price };
  } catch (err) {
    return { Error: "This item is not supported" };
  }
};

VS_parser = async (resp, url) => {
  //Later add the size function

  const $ = cheerio.load(resp);

  innerAPI = "https://api.victoriassecret.com/";

  pid = resp
    .match(new RegExp('<script id="brastrap-data".*'))[0]
    .match(new RegExp('"key":"p.*'))[0]
    .match(new RegExp('"version":"..","path"(.*?)",'))[0]
    .split('"');

  console.log(innerAPI + "products/" + pid[3] + "/" + pid[7]);

  response = await axios.get(innerAPI + "products/" + pid[3] + "/" + pid[7]);

  try {
    product = response.data.product;

    const name = (
      product.brandName +
      " - " +
      product.shortDescription +
      "&amp;"
    )
      .replace("&apos;", "")
      .replace("&amp;", "");

    var price_size = [];
    product.inventory.forEach(
      (myfunction = (item, idx) => {
        // if(item.size1 == size1 && item.size2 == size2)
        // {
        price_size.push(
          //{
          //choice: item.choice,
          //size1:item.size1,
          //size2:item.size2,
          //avaliable:item.isAvailable,
          //original_price:item.originalPriceNumerical,
          //sale_price:
          item.salePriceNumerical
          //}
        );
        //}
      })
    );

    price_size = Array.from(new Set(price_size.map(JSON.stringify))).map(
      JSON.parse
    );

    least_price = Math.min(...price_size);

    for (let obj of product.purchasableImages) {
      for (let imgobj of obj.choices) {
        if (imgobj.images.length != 0) {
          img =
            innerAPI.replace("api.", "") +
            "p/760x1013/" +
            imgobj.images[0].image +
            ".jpg";
          break;
        }
      }
    }

    return { name, price: String(least_price), img };
  } catch (err) {
    return { Error: "Product not supported", Errorval: err };
  }
};

//--------------------------------------------------------------------------------------------------------
UpdateDB = async (url, company_name, user_id, data) => {
  const usersubs = await URLobj.findOne({ user: user_id });
  const { name, img, price } = data;

  //console.log(company_name);

  let idx = -1;

  //   if (usersubs.subscription_data.length > 0) {
  for (let i = 0; i < usersubs.subscription_data.length; i++) {
    if (usersubs.subscription_data[i].url == url) {
      console.log("[+] Old record found");
      idx = i;
    }
  }

  if (idx != -1) {
    console.log("[+] Updating old record");
    //Old record exists - update
    old_price = usersubs.subscription_data[idx].current_price;

    if (old_price > price) {
      //console.log("Status set to low");
      new_status = "low";
    } else if (old_price < price) {
      new_status = "high";
    } else {
      new_status = "level";
    }

    const newsub = {
      url: url,
      company: company_name,
      product_name: name,
      product_imageURL: img,
      current_price: price,
      date: new Date(),
      status: new_status
    };

    usersubs.subscription_data[idx] = newsub;
  } else {
    //New subobj - unshift
    console.log("[+] New Subscription received");
    const newsub = {
      url: url,
      company: company_name,
      product_name: name,
      product_imageURL: img,
      current_price: price,
      date: new Date(),
      status: "No prev data"
    };

    usersubs.subscription_data.unshift(newsub);
  }

  await usersubs.save();
};

Scraper = (newusersub, user_id) => {
  //Objective : scrapes the data -> parses -> updates the database - does not return anything.

  const { url, company_name } = newusersub;

  //Scraper
  axios
    .get(url, { headers: { "User-Agent": "My User Agent 1.0" } })
    .then(async response => {
      //Depending on the company activate the parser
      //console.log("------------------------------\nURL", url, "\n")
      if (company_name == "Nike") {
        var data = Nike_parser(response.data);
        data.price = parseFloat(data.price.replace("$", "").trim());
        //console.log(data);
        UpdateDB(url, company_name, user_id, data);
      }
      if (company_name == "HNM") {
        var data = HNM_parser(response.data);
        data.price = parseFloat(data.price.replace("$", "").trim());
        //console.log(data);
        UpdateDB(url, company_name, user_id, data);
      }
      if (company_name == "Myntra") {
        var data = Myntra_parser(response.data);
        data.price = parseFloat(data.price.replace("Rs.", "").trim());
        //console.log(data);
        UpdateDB(url, company_name, user_id, data);
      }
      if (company_name == "VS") {
        var data = await VS_parser(response.data, url).then(function(resp) {
          resp.price = parseFloat(resp.price.replace("$", "").trim());
          //console.log(resp);
          UpdateDB(url, company_name, user_id, resp);
        });
      }
    })
    .catch(error => {
      console.log(error);
    });
};

// @route    GET urlobjs/:id
// @desc     Display urlobjs for all subscriptions by id
// @access   Public

router.get("/urlobjs/:id", async (req, res) => {
  const id = req.params.id;
  const urlobjs = await URLobj.findOne({ user: id });
  res.send(urlobjs);
});

// @route    POST /add
// @desc     Add new url obj from url
// @access   Public

router.post(
  "/add",
  [
    check("url", "Please provide the url")
      .not()
      .isEmpty(),
    check("company_name", "Please provide company name")
      .not()
      .isEmpty(),
    check("id", "Please provide id")
      .not()
      .isEmpty()
  ],
  async (req, res) => {
    {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.send({ errors: errors.array() });
      }

      const { url, company_name, id } = req.body;

      const user = await User.findOne({ _id: id });

      if (!user) {
        return res.status(500).send({ err: "User not found" });
      }

      //create a subscription
      const newsub = { url, company_name };
      user.subscriptions.unshift(newsub);
      await user.save();

      res.send({ action: "Add subscription", obj: newsub });
    }
  }
);

// @route    POST /delete
// @desc     Remove subscription from list
// @access   Public

router.delete(
  "/remove",
  [
    check("id", "Please provide id to delete")
      .not()
      .isEmpty(),
    check("subn_id", "Please provide id to delete")
      .not()
      .isEmpty()
  ],
  async (req, res) => {
    errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.send({ errors: errors.array() });
    }

    const { id, subn_id } = req.body;
    const user = await User.findOne({ _id: id });

    if (!user) {
      return res.status(500).send({ err: "User not found" });
    }

    const removeIndex = user.subscriptions
      .map(item => item.id)
      .indexOf(subn_id);

    user.subscriptions.splice(removeIndex, 1);
    await user.save();

    res.send({ user });
  }
);

// @route    GET /scheduledscraper
// @desc     Call scrape when called
// @access   Public

router.get("/scheduledscraper", async (req, res) => {
  const users = await User.find({}, async function(err, users) {
    if (err) {
      console.log("[-] Scraping cancelled -- fatal error");
      console.log("****");
      console.log(err);
      console.log("****");
      res.send({ job: "Scraping Job", err });
    } else {
      users.forEach(function(user) {
        if (user.subscriptions.length > 0) {
          let x = 0;
          const interval = setInterval(function() {
            if (x < user.subscriptions.length) {
              Scraper(user.subscriptions[x], user.id);
              x++;
            } else {
              clearInterval(interval);
            }
          }, 5000);
        }
        if (user.subscriptions.length == 0) {
          console.log("[-] No subscriptions found");
        }
      });
    }
  });

  res.send({ job: ["Scraping"], status: "Successfull" });
});

router.get("/mailman", async (req, res) => {
  const users = await User.find({}, function(err, users) {
    if (err) {
      res.send({ job: "Mailman Job", err });
    } else {
      users.forEach(function(user) {
        const { _id, email } = user;
        MailMan(_id, email);
      });
    }
  });

  res.send({ job: "Mailman", status: "Succesfull" });
});

MailMan = async (user_id, email) => {
  console.log("[+] MailMan log - Daily check initialized - ", email);

  const userobj = await URLobj.findOne({ user: user_id });

  if (userobj.subscription_data.length > 0) {
    Discount_items = [];
    for (let i = 0; i < userobj.subscription_data.length; i++) {
      if (userobj.subscription_data[i].status == "low") {
        console.log("[+] MailMan log - Discount found!");
        Discount_items.unshift(userobj.subscription_data[i]);
      }
    }
    //console.log(Discount_items, "I shall mail them now");
    if (Discount_items.length > 0) {
      SendMail(Discount_items, email);
    } else {
      console.log("[+] Mailman log - No discount found");
    }
  }
  if (userobj.subscription_data.length == 0) {
    console.log("[+] Mailman log - Subscription box empty");
  }
};

SendMail = (Discount_items, email) => {
  msg = "";

  for (let i = 0; i < Discount_items.length; i++) {
    const {
      url,
      company,
      product_name,
      product_imageURL,
      current_price
    } = Discount_items[i];
    msg += `<br><div style:"text-align: center">
                <p>------------------------------------------</p>
                <a href="${url}"><h2>Name : ${product_name}</h2></a>
                <h2>Price : ${current_price}</h2>
                <h2>Company : ${company}</h2><br>
                <img src="${product_imageURL}" alt="No image found" height="100" width="100"/><br>
                <p>------------------------------------------</p>
            </div><br>`;
  }

  intro = `<h3>Greetings from Krabby, </h3><br><br>`;

  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "krabbysoft@gmail.com",
      pass: "mysoftware1301"
    }
  });

  var mailOptions = {
    from: "krabbysoft@gmail.com",
    to: email,
    subject: "Discounts for " + new Date(),
    html: "<html><body>" + intro + msg + "</body></html>"
  };

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("[+] MailMan log - Email sent: " + info.response);
    }
  });
};

module.exports = router;

//EXTRA CODE

//Deprecated cron scheduler

// Scheduler = async user_id => {
//   var task = cron.schedule(
//     "*/15 * * * *",
//     async function() {
//       const user = await User.findOne({ _id: user_id });

//       if (user.subscriptions.length > 0) {
//         let x = 0;
//         const interval = setInterval(function() {
//           if (x < user.subscriptions.length) {
//             Scraper(user.subscriptions[x], user_id);
//             x++;
//           } else {
//             clearInterval(interval);
//           }
//         }, 5000);
//       }
//       if (user.subscriptions.length == 0) {
//         console.log("[-] No subscriptions found");
//       }
//     },
//     { scheduled: "false" }
//   );

//   task.start();
// };
