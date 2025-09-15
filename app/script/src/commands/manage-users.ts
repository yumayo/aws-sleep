import { UserStorage } from '../../../api/src/models/auth/user-storage'

export async function manageUsers(args: string[]) {
  const userStorage = new UserStorage()

  if (args.length === 0) {
    console.log(`使用方法:
  ユーザー追加: npm run dev manage-users add <ユーザー名> <パスワード>
  ユーザー削除: npm run dev manage-users remove <ユーザー名>
  ユーザー一覧: npm run dev manage-users list`)
    process.exit(0)
  }

  const command = args[0]

  switch (command) {
    case 'add': {
      if (args.length < 3) {
        console.error('エラー: ユーザー名とパスワードを指定してください')
        process.exit(1)
      }

      const [, username, password] = args

      if (!username.trim()) {
        console.error('エラー: ユーザー名が空です')
        process.exit(1)
      }

      if (password.length < 6) {
        console.error('エラー: パスワードは6文字以上である必要があります')
        process.exit(1)
      }

      try {
        await userStorage.createUser(username.trim(), password)
        console.log(`ユーザー「${username}」を作成しました`)
      } catch (error) {
        console.error('エラー:', error instanceof Error ? error.message : 'Unknown error')
        process.exit(1)
      }
      break
    }

    case 'remove': {
      if (args.length < 2) {
        console.error('エラー: ユーザー名を指定してください')
        process.exit(1)
      }

      const [, username] = args

      try {
        const deleted = await userStorage.deleteUser(username.trim())
        if (deleted) {
          console.log(`ユーザー「${username}」を削除しました`)
        } else {
          console.log(`ユーザー「${username}」は存在しません`)
        }
      } catch (error) {
        console.error('エラー:', error instanceof Error ? error.message : 'Unknown error')
        process.exit(1)
      }
      break
    }

    case 'list': {
      try {
        const users = await userStorage.listUsers()
        if (users.length === 0) {
          console.log('ユーザーは登録されていません')
        } else {
          console.log('登録済みユーザー:')
          users.forEach(user => {
            const createdDate = new Date(user.createdAt).toLocaleString('ja-JP')
            console.log(`  - ${user.username} (作成日: ${createdDate})`)
          })
        }
      } catch (error) {
        console.error('エラー:', error instanceof Error ? error.message : 'Unknown error')
        process.exit(1)
      }
      break
    }

    default: {
      console.error(`エラー: 不明なコマンド「${command}」`)
      console.log('利用可能なコマンド: add, remove, list')
      process.exit(1)
    }
  }
}

