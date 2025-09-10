// import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// import { FieldValue } from "firebase-admin/firestore";
import express, {Request, Response} from "express";
import cors from "cors";

admin.initializeApp();
const db = admin.firestore();
// const FieldValue = admin.firestore.FieldValue;

const app = express();
app.use(cors({origin: true}));
app.post("/login", async (req: Request, res: Response) => {
  try {
    const {username, password} = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu username hoặc password",
      });
    }

    // Kiểm tra username có tồn tại
    const userQuery = await db
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    if (userQuery.empty) {
      return res.status(404).json({
        success: false,
        message: "Username không tồn tại",
      });
    }

    const user = userQuery.docs[0].data();

    // Kiểm tra password (⚠️ nên hash để so sánh)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: "Sai mật khẩu",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      user: {id: userQuery.docs[0].id, username: user.username},
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server, vui lòng thử lại sau",
    });
  }
});
