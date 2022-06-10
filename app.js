var mysql = require('mysql');

var express = require('express')
var bodyParser = require('body-parser');

var app = express()

app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json());
const port = 3000


app.get('/', (req, res) => {
  res.send('Hello Polypuss!')
  console.log(req)
})

function checkDevice(res, deviceID, nextAPICallback) {
  if (deviceID) {
    con.query(
      "SELECT * FROM qatch.stations WHERE StationCode like '%" + deviceID + "'",
      function (err, results) {
        if (err) {
          res.status(500).send(err)
        }
        else {
          if (results && results.length > 0) {
            nextAPICallback()
          }
          else {
            res.status(401).send("This device is not registered in the station, please register the device.")
          }
        }
      });
  }
  else {
    res.status(401).send("Please provide a device ID.")
  }
}

app.post('/api/v1/users/All', function (req, res) {
  con.query("SELECT * FROM polypussysdb.users", function (err, result, fields) {
    if (err)
      res.jsonp(err);
    res.jsonp(result)
  });
})


selectUserAccessRights = (groupID) => {
  return new Promise((resolve, reject) => {
    con.query("SELECT AccessRightKey as accessKey from " +
      " polypussysdb.accessrights where GroupID = ? and AccessRightValue = 'True';",
      [groupID], (error, elements) => {
        if (error) {
          return reject(error);
        }
        return resolve(elements);
      });
  });
};


selectUserTables = (userID) => {
  return new Promise((resolve, reject) => {
    con.query(
      'SELECT w.TableID as tableID, tableNumber, numberofSeats, IF(w.TableID in (select tableId from qatch.movementsonhold), true, false) as isOnHold ,' +
      'IF(moh.MovementID in (select MovementID from qatch.movementsentriesonhold), true, false) as isEntriesOnHold ' +
      'FROM qatch.waiterstables as w left join qatch.restaurenttables as r on r.tableId = w.tableId  left join qatch.movementsonhold as moh  on moh.tableId = w.tableId ' +
      ' where userID= ?',
      [userID],
      (error, elements) => {
        if (error) {
          return reject(error);
        }
        return resolve(elements);
      });
  });
}


selectAllItems = () => {
  return new Promise((resolve, reject) => {
    con.query('select * from qatch.items',
      (error, elements) => {
        if (error) {
          return reject(error);
        }
        return resolve(elements);
      });
  });
}


selectItemCategories = () => {
  return new Promise((resolve, reject) => {
    con.query('select * from qatch.categories',
      (error, elements) => {
        if (error) {
          return reject(error);
        }
        return resolve(elements);
      });
  });
}


selectMovementsOnHold = (userID) => {
  return new Promise((resolve, reject) => {
    con.query('SELECT * FROM qatch.movementsonhold where TableID in (select TableID from qatch.waiterstables where userid = ?)',
    [userID],
      (error, elements) => {
        if (error) {
          return reject(error);
        }
        return resolve(elements);
      });
  });
}


selectItemsOnHold = (userID) => {
  return new Promise((resolve, reject) => {
    con.query('SELECT * FROM qatch.movementsentriesonhold where MovementId in (select MovementId as mid from qatch.movementsonhold where TableID in ( select TableID as tid from qatch.waiterstables where userid = ?))',
    [userID],
      (error, elements) => {
        if (error) {
          return reject(error);
        }
        return resolve(elements);
      });
  });
}






async function getAllData(res, groupID, userID) {

  const userAcessPromise = selectUserAccessRights(groupID)
  const userTablePromise = selectUserTables(userID)
  const allItemsPromise = selectAllItems()
  const itemsCategoriesPromise = selectItemCategories()
  const movementsOnHoldPromise = selectMovementsOnHold(userID)
  const itemsOnHoldPromise = selectItemsOnHold(userID)

  const promises = [userAcessPromise, userTablePromise, allItemsPromise, itemsCategoriesPromise, movementsOnHoldPromise, itemsOnHoldPromise]

  try {
    const result = await Promise.all(promises)
    res.jsonp({
      code: 1,
      data: {
        accessRights: result[0].map( currentValue => {
          return currentValue.accessKey
        }),
        tables: result[1], 
        items: result[2],
        itemCategories: result[3],
        movementsOnHold: result[4],
        itemsOnHold: result[5]
      },
      message: "App data fetched"
    })
  } catch (error) {
    res.status(500).send("Exception at getting all data: " + error)
  }
}

app.post('/api/v1/data', function (req, res) {
  checkDevice(res, req.headers["did"], () => {
    const groupID = req.body.groupID
    const userID = req.body.userID
    if (!groupID && !userID) {
      res.status(400).send("Please provide groupId and userID.")
    }
    else {
      getAllData(res, groupID, userID)
    }
  })
})



app.post('/api/v1/connect', function (req, res) {
  checkDevice(res, req.headers["did"], () => {
    res.jsonp(
      {
        code: 1,
        message: `The device with id  ${req.headers["did"]} is connected to the server.`
      })
  })
})


app.post('/api/v1/auth/login', function (req, res) {
  const userName = req.body.userName;
  const password = req.body.password;
  checkDevice(res, req.headers["did"], () => {
    con.query(
      'SELECT * FROM polypussysdb.users WHERE userName=? and userPassword =?', [userName, password],
      (err, results) => {
        if (err) {
          res.status(500).send(err)
        }
        else {
          con.query("update polypussysdb.users set usersOnline = 1 where userName=?", [userName])
          if (results && results.length > 0) {
            res.jsonp({ code: 1, message: "Login Successful", data: results[0] })
          }
          else {
            res.status(401).send("Wrong username or password")
          }
        }
      });
  })
})




app.post('/api/v1/auth/logout', function (req, res) {
    if (req.body && req.body.userName) {
      con.query("update polypussysdb.users set usersOnline = 0 where userName=?", [req.body.userName],
        function (err, result) {
          if (err)
            res.status(500).send(err)
          else {
            if (result.affectedRows > 0) {
              res.jsonp({ code: 1, message: "Logged out" });
            }
            else {
              res.status(404).send("User not found, maybe it is deleted.");
            }
          }

        });
    }
    else {
      res.status(500).send("No user name sent")
    }
})

var con = mysql.createConnection({
  host: "localhost",
  port: "3306",
  user: "root",
  password: "1234"
});



con.connect(function (err) {
  if (err)
    throw err;
  console.log("Connected to database server.");
});


app.listen(port, () => {
  console.log(`Polypus listening at http://localhost:${port}`)
})


