const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;

initializationDbAndServerDb = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "twitterClone.db"),
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`database is error ${error.message}`);
    process.exit(1);
  }
};

initializationDbAndServerDb();

let outputResult = () => {};

// write an middleware function

const authorization = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;

  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

// register api-1

app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;
  if (password.length > 6) {
    const getUserQuery = `SELECT * FROM user WHERE username ='${username}'`;
    const userDb = await db.get(getUserQuery);

    const hashedPassword = await bcrypt.hash(password, 10);
    if (userDb !== undefined) {
      response.status(400);
      response.send("User already exists");
    } else {
      const createUserQuery = `
    INSERT INTO 
       user (username, password, name, gender)
    VALUES (
        '${username}',
        '${hashedPassword}',
        '${name}',
        '${gender}'

    ) ;  `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("Password is too short");
  }
});

//login api-2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username ='${username}'`;
  const userDb = await db.get(getUserQuery);

  if (userDb === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatchPassword = await bcrypt.compare(password, userDb.password);
    if (isMatchPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(userDb, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//user tweet-3

app.get("/user/tweets/feed", authorization, async (request, response) => {
  const { payload } = request;
  const { username, user_id } = payload;
  const getUserQuery = `
    SELECT 
        username,
        tweet,
        date_time as dateTime 
    FROM  
       follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
       follower.follower_user_id=${user_id}
    ORDER BY 
       date_time DESC
    LIMIT
       4 ; `;

  const userData = await db.all(getUserQuery);
  response.send(userData);
});

//user follower-4

app.get("/user/following/", authorization, async (request, response) => {
  const { payload } = request;
  const { username, user_id } = payload;
  const getSelectQuery = `
  SELECT 
    username 
   FROM
     user INNER JOIN follower ON user.user_id = follower.following_user_id
   WHERE
     follower.follower_user_id='${user_id}';`;
  const userArray = await db.all(getSelectQuery);
  response.send(userArray);
});

// user following-5

app.get("/user/followers/", authorization, async (request, response) => {
  const { payload } = request;
  const { user_id, username } = payload;
  const getSelectQuery = `
    SELECT 
      username 
    FROM 
      user INNER JOIN follower ON follower.follower_user_id = user.user_id
    WHERE
      follower.following_user_id = ${user_id};`;
  const userArray = await db.all(getSelectQuery);
  response.send(userArray);
});

//tweet/tweet_id api-6

app.get("/tweets/:tweetId/", authorization, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { username, user_id } = payload;
  //   console.log(tweetId);
  const getSelectQuery = `
        SELECT
            *
        FROM 
            tweet 
        WHERE 
            tweet_id=${tweetId};`;
  const tweetResult = await db.get(getSelectQuery);
  //   response.send(tweetResult);
  const getFollowerQuery = `
        SELECT
        *  
        FROM
            follower INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id =${user_id};`;
  const userFollowerResult = await db.all(getFollowerQuery);
  //   console.log(tweetResult.user_id);
  //   response.send(userFollowerResult);

  if (
    userFollowerResult.some(
      (item) => item.following_user_id === tweetResult.user_id
    )
  ) {
    const getTweetDetailsQuery = `
        SELECT
          tweet,
          COUNT(DISTINCT(like.like_id)) as likes,
          COUNT(DISTINCT(reply.reply_id)) as replies,
          tweet.date_time as dateTime
        FROM
          tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply.tweet_id = tweet.tweet_id
        WHERE
          tweet.tweet_id=${tweetId} AND tweet.user_id=${userFollowerResult[0].user_id};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  }
});

//api-7

// app.get("/tweets/:tweetId/likes/", authorization, async (request, response) => {
//   const { tweetId } = request;
//   const { payload } = request;
//   const { username, user_id } = payload;
//   const getTweetLikes = `
//   SELECT
//     *
//   FROM
//     follower INNER JOIN tweet ON tweet.tweet_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
//     INNER JOIN user.user_id = like.user_id
//  WHERE
//     tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;
//   const result = await db.all(getTweetLikes);
//   response.send(result);
// });

//api-9

app.get("/user/tweets/", authorization, async (request, response) => {
  const { payload } = request;
  const { user_id } = payload;
  const getTweetDetailsQuery = `
        SELECT
          tweet,
          COUNT(DISTINCT(like.like_id)) as likes,
          COUNT(DISTINCT(reply.reply_id)) as replies,
          tweet.date_time as dateTime
        FROM
          user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN reply.tweet_id = tweet.tweet_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
        WHERE
          user.user_id=${user_id}
        GROUP BY 
           tweet.tweet_id = ${tweet};`;
  const tweetResult = await db.all(getTweetDetailsQuery);
  response.send(tweetResult);
});

//api-10

app.post("/user/tweets/", authorization, async (request, response) => {
  const { tweetId } = request;
  const { tweet } = request;
  const { payload } = request;
  const { user_id } = payload;
  const createTweet = `
  INSERT INTO 
   tweet 
   (tweet, user_id)
   VALUES(
    '${tweet}',
    ${user_Id}

);`;

  await db.run(createTweet);
  response.send("Created a Tweet");
});

///api-11

app.delete("/tweets/:tweetId/", authorization, async (request, response) => {
  const { payload } = request;
  const { tweetId } = request;
  const { user_id } = payload;
  const getSelectQuery = `SELECT * FROM tweet WHERE tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
  const userResult = await db.get(getSelectQuery);

  if (userResult.length !== 0) {
    const deleteQuery = `DELETE FROM tweet WHERE tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId}; `;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
