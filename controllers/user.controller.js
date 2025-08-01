import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generate-token.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if ([name, email, password].some((field) => field?.trim() === "")) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required!" });
  }

  const userExist = await User.findOne({ email });

  if (userExist) {
    return res
      .status(400)
      .json({ success: false, message: "User already exist!" });
  }

  const avatarLocalPath = req.file?.path || null;
  if (!avatarLocalPath) {
    return res
      .status(400)
      .json({ success: false, message: "something went wrong!" });
  }

  const avatar = await uploadToCloudinary(avatarLocalPath);

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({
    name,
    email,
    password: hashedPassword,
    avatar: {
      url: avatar.secure_url,
      public_id: avatar.public_id,
    },
  });
  const refreshToken = generateAccessToken(user._id, user.role);
  user.refreshToken = refreshToken;
  await user.save();

  const accessToken = generateAccessToken(user._id, user.role);

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  res.status(200).json({
    success: true,
    message: "User registered successfully!",
    user: createdUser,
    accessToken,
  });
});

// Login
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if ([email, password].some((field) => field?.trim() === "")) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required!" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ success: false, message: "User not found" });
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);

  if (!isPasswordMatched) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }

  const refreshToken = generateRefreshToken(user._id, user.role);
  user.refreshToken = refreshToken;
  await user.save();

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  const accessToken = generateAccessToken(user._id, user.role);

  res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json({ success: true, user: loggedInUser, accessToken, refreshToken });
});

// Logout
const logout = asyncHandler(async (req, res) => {
  const options = {
    httpOnly: true,
    secure: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  res.clearCookie("accessToken", options);
  res.clearCookie("refreshToken", options);

  res.status(200).json({ success: true, message: "User Logged Out!" });
});

// Refresh Token
const refreshToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken;

  if (!incomingRefreshToken) {
    return res.status(401).json({ message: "unauthorized!" });
  }

  const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  );

  const user = await User.findById(decodedToken.id);

  if (incomingRefreshToken !== user.refreshToken) {
    return res.status(401).json({ message: "invalid or used token!" });
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json({ success: true, accessToken, refreshToken });
});

// Change Password
const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(userId);

  if (!user) {
    return res.status(400).json({ message: "user not found!" });
  }

  const isValidPassword = await bcrypt.compare(oldPassword, user.password);

  if (!isValidPassword) {
    return res
      .status(401)
      .json({ success: false, message: "old password is incorrect" });
  }

  const hashPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashPassword;
  await user.save();

  return res
    .status(200)
    .json({ success: true, message: "Password changed successfully!" });
});

// Delete User
const deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid user ID!" });
  }
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found!" });
  }

  if (user.avatar?.public_id) {
    await cloudinary.uploader.destroy(user.avatar.public_id);
  }

  await User.findByIdAndDelete(userId);

  res.status(200).json({ success: true, message: "User deleted!" });
});

// Get All Users
const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
  const sortObj = {};

  sortObj[sortBy] = sortOrder;

  const [users, total] = await Promise.all([
    User.find().skip(skip).limit(limit).sort(sortObj),
    User.countDocuments(),
  ]);

  const totalPages = Math.ceil(total / limit);

  if (!users) {
    return res
      .status(404)
      .json({ success: false, message: "users not found!" });
  }

  res
    .status(200)
    .json({
      success: true,
      currentPage: page,
      totalPages,
      totalUsers: total,
      users,
    });
});

export {
  registerUser,
  loginUser,
  logout,
  refreshToken,
  changePassword,
  deleteUser,
  getUsers,
};
