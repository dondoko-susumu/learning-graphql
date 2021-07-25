const { authorizeWithGithub } = require('../lib')
const fetch = require('node-fetch')
const { ObjectID } = require('mongodb')

module.exports = {

  async postPhoto(parent, args, { db, currentUser }) {

    if (!currentUser) {
      throw new Error('only an authorized user can post a photo')
    }

    const newPhoto = {
      ...args.input,
      userID: currentUser.githubLogin,
      created: new Date()
    }

    const { insertedIds } = await db.collection('photos').insert(newPhoto)
    newPhoto.id = insertedIds[0]

    return newPhoto

  },

  async tagPhoto(parent, args, { db }) {

    await db.collection('tags')
      .replaceOne(args, args, { upsert: true })

    return db.collection('photos')
      .findOne({ _id: ObjectID(args.photoID) })

  },

  async githubAuth(parent, { code }, { db }) {

    // GitHubからデータを取得する
    let {
      message,
      access_token,
      avatar_url,
      login,
      name
    } = await authorizeWithGithub({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code
    })

    // メッセージがある場合は何らかのエラーが発生している
    if (message) {
      throw new Error(message)
    }

    // データをひとつのオブジェクトにまとめる
    let latestUserInfo = {
      name,
      githubLogin: login,
      githubToken: access_token,
      avatar: avatar_url
    }

    // 新しい情報を元にレコードを追加したり更新したりする
    const { ops:[user] } = await db
      .collection('users')
      .replaceOne({ githubLogin: login }, latestUserInfo, { upsert: true })

    // ユーザーデータとtokenを返す
    return { user, token: access_token }
  
  },

  addFakeUsers: async (parent, { count }, { db }) => {
    var randomUserApi = `https://randomuser.me/api/?results=${count}`

    var { results } = await fetch(randomUserApi).then(res => res.json())

    var users = results.map(r => ({
      githubLogin: r.login.username,
      name: `${r.name.first} ${r.name.last}`,
      avatar: r.picture.thumbnail,
      githubToken: r.login.sha1
    }))

    await db.collection('users').insert(users)

    return users
  },

  async fakeUserAuth(parent, { githubLogin }, { db }) {
    var user = await db.collection('users').findOne({ githubLogin })

    if (!user) {
      throw new Error(`Cannot find user with githubLogin "${githubLogin}"`)
    }

    return {
      token: user.githubToken,
      user
    }
  }

}