const express = require("express"); 
const path = require("path"); 
const sqlite3 = require("sqlite3"); 
const { open } = require("sqlite"); 
const bcrypt = require("bcrypt"); 

const jwt = require("jsonwebtoken"); 
const app = express(); app.use(express.json()); 
const dbPath = path.join(__dirname, "twitterClone.db"); 
let db = null; 
const initializeDbAndServer = async () => { 
    try { 
        db = await open({ filename: dbPath, driver: sqlite3.Database, }); 
        app.listen(3000, () => { 
            console.log("Server Running at http://localhost:3000/"); 
        }); 
    } 
    catch (error) {
        console.log(`DB Error: ${error.message}`);
         process.exit(1); 
        } 
    }; 
initializeDbAndServer(); 
const getFollowingPeopleIdsOfUser = async (username) => { 
const getTheFollowingPeopleQuery = `
SELECT following_user_id 
FROM 
follower INNER JOIN User ON user.user_id = follower.follower_user_id 
WHERE user.username='${username}'`;
const followingPeople = await db.all(getTheFollowingPeopleQuery); 
const arrayOfIds = followingPeople.map( (eachUser) => eachUser.following_user_id ); 
    return arrayOfIds; 
};
const authentication = (request, response, next) => { 
let jwtToken; 
const authHeader = request.headers["authorization"]; 
if (authHeader) { 
    jwtToken = authHeader.split(" ")[1]; 
} 
if (jwtToken) 
    { 
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => { 
        if (error) { 
            response.status(401); 
            response.send("Invalid JWT Token"); 
        } 
        else { 
            request.username = payload.username; 
            request.userId = payload.userId; 
            next(); 
        } 
    }); 
} 
else { 
     response.status(401); 
    response.send("Invalid JWT Token"); 
} 
}; 
const tweetAccessVerification = async (request, response, next) => { 
const { userId } = request; 
const { tweetId } = request.params; 
const getTweetQuery = `
SELECT * FROM 
tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
WHERE tweet.tweet_id = '${tweetId}' 
AND follower_user_id='${userId}'`;
const tweet = await db.get(getTweetQuery); 
if (!tweet) { 
   response.status(401); 
   response.send("Invalid Request"); 
} 
else { 
    next(); 
} 
}; 

// API 1 - User Registration 
app.post("/register/", async (request, response) => { 
    const { username, password, name, gender } = request.body; 
    const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`; 
    const userDBDetails = await db.get(getUserQuery); 
    if (userDBDetails) { 
        response.status(400).send("User already exists"); 
    } 
    else { 
        if (password.length < 6){ 
            response.status(400).send("Password is too short"); 
        } else { 
            const hashedPassword=await bcrypt.hash(password, 10); 
            const createUserQuery=` 
                INSERT INTO user (username, password, name, gender) 
                VALUES ('${username}', '${hashedPassword}' , '${name}' , '${gender}' ); 
                await db.run(createUserQuery)`;
                response.send("User created successfully"); 
            } 
        } 
    }); 

// API 2 - User Login 
app.post("/login/", async (request, response)=> { 
    const { username, password } = request.body; 
    const getUserQuery = `
    SELECT * FROM User WHERE username='${username}';`
    const userDbDetails = await db.get(getUserQuery); 
    if (!userDbDetails) { 
        response.status(400).send("Invalid user");
    } else {
         const isPasswordCorrect = await bcrypt.compare( password, userDbDetails.password ); 
         if (isPasswordCorrect) { 
            const payload = { username, userId: userDbDetails.user_id }; 
            const jwtToken = jwt.sign(payload, "SECRET_KEY"); 
            response.send({ jwtToken }); 
        } 
        else { 
            response.status(400).send("Invalid password"); 
        } 
    } 
}); 

// API 3 - Get tweets feed of followed users 
app.get("/user/tweets/feed/", authentication, async (request, response) => { 
    const { username } = request; 
    const followingPeopleIds = await getFollowingPeopleIdsOfUser(username); 
    const getTweetsQuery = `
    SELECT username, tweet, date_time as dateTime 
    FROM 
    User INNER JOIN tweet ON user.user_id = tweet.user_id 
    WHERE user.user_id IN (${followingPeopleIds}) 
    ORDER BY date_time DESC LIMIT 4`;
    const tweets = await db.all(getTweetsQuery); 
    response.send(tweets); 
}); 

// API 4 - Get users followed by a user 
app.get("/user/following/", authentication, async (request, response) => { 
    const { userId } = request; 
    const getFollowingUsersQuery = `
    SELECT name 
    FROM 
    follower INNER JOIN User ON user.user_id = follower.following_user_id 
    WHERE follower_user_id = '${userId}'`;
    const followingPeople = await db.all(getFollowingUsersQuery); 
    response.send(followingPeople); 
}); 

// API 5 - Get followers of a user 
app.get("/user/followers/", authentication, async (request, response) => { 
    const { userId } = request; 
    const getFollowersQuery = `
    SELECT DISTINCT name 
    FROM 
    follower INNER JOIN User ON user.user_id = follower.follower_user_id 
    WHERE following_user_id='${userId}'`;
    const followers = await db.all(getFollowersQuery); 
    response.send(followers); 
}); 

// API 6 - Get a specific tweet 
app.get( "/tweets/:tweetId/", authentication, tweetAccessVerification, async (request, response) => { 
    const { tweetId } = request.params; 
    const getTweetQuery = ` 
    SELECT tweet, (SELECT COUNT() 
    FROM 
    Like WHERE tweet_id= '${tweetId}') AS likes, 
    (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies, date_time AS dateTime 
    FROM tweet 
    WHERE tweet.tweet_id = '${tweetId}'`; 
    const tweet = await db.get(getTweetQuery); 
    response.send(tweet); 
} ); 

// API 7 - Get likes for a specific tweet 
app.get( "/tweets/:tweetId/likes/", authentication, tweetAccessVerification, async (request, response) => { 
    const { tweetId, userId } = request.params; 
    const getLikesQuery = ` 
    SELECT username 
    FROM 
    User INNER JOIN like ON user.user_id= like.user_id 
    WHERE tweet_id = '${tweetId}'`;
    const likedUsers = await db.all(getLikesQuery); 
    const usersArray = likedUsers.map((eachUser) => eachUser.username); 
    response.send({ likes: usersArray }); 
} ); 

// API 8 - Get replies for a specific tweet 
app.get( "/tweets/:tweetId/replies/", authentication, tweetAccessVerification, async (request, response) => { 
    const { tweetId } = request.params; 
    const getRepliedQuery = ` SELECT name, reply 
    FROM 
    user INNER JOIN reply ON user.user_id = reply.user_id 
    WHERE tweet_id = '${tweetId}'`;
    const repliedUsers = await db.all(getRepliedQuery); 
    response.send({ replies: repliedUsers }); 
} ); 
// API 9 - Create a tweet 
app.post("/user/tweets/", authentication, async (request, response) => { 
    const { tweet } = request.body; 
    const userId = parseInt(request.userId); 
    const dateTime = new Date().toJSON().substring(0, 19).replace("T", " "); 
    const createTweetQuery = ` 
    INSERT INTO tweet (tweet, user_id, date_time) 
    VALUES ('${tweet}', '${userId}', '${dateTime}')`;
    await db.run(createTweetQuery); 
    response.send("Created a Tweet"); });

// API 10 - Get a specific tweet by ID 
app.get("/tweets/:tweetId/", authentication, async (request, response) => { 
    try { 
        const userId = parseInt(request.userId); 
        const { tweetId } = request.params; 
        // Check if the tweet belongs to a user the authenticated user follows 
        const getTweetQuery = ` SELECT tweet, COUNT(DISTINCT like_id) AS likes, 
        COUNT(DISTINCT reply_id) AS replies,
        date_time AS dateTime 
        FROM 
        tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id 
        LEFT JOIN like ON tweet.tweet_id = like.tweet_id 
        INNER JOIN follower ON tweet.user_id = follower.following_user_id 
        WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}' 
        GROUP BY tweet.tweet_id`; 
        const tweet = await db.get(getTweetQuery); 
        if (!tweet) { 
            response.status(401).send("Invalid Request"); 
        } else { 
            response.send(tweet); 
        } 
    } catch (error) {
         console.error(error); 
         response.status(500).send("Internal Server Error"); 
        } 
}); 

// API 11 - Delete a tweet 
app.delete("/tweets/:tweetId/", authentication, async (request, response) => { 
    const { tweetId } = request.params; 
    const userId = parseInt(request.userId); 
    // Check if the tweet belongs to the user 
    const getTweetQuery = `
    SELECT * FROM tweet 
    WHERE tweet_id = '${tweetId}' AND user_id = '${userId}'`; 
    const tweet = await db.get(getTweetQuery); 
    if (!tweet) { 
        // If the tweet doesn't belong to the user, send 'Invalid Request' 
        response.status(401); 
        response.send("Invalid Request"); 
    } else { 
        // If the tweet belongs to the user, proceed with deletion 
        const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}'`; 
        await db.run(deleteTweetQuery); 
        response.send("Tweet Removed"); 
    } 
}); 
module.exports = app;